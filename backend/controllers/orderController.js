// controllers/orderController.js
const { query, queryOne, pool } = require('../config/db');
const { v4: uuidv4 }            = require('uuid');
const crypto                    = require('crypto');
const { confirmOrderInDB }      = require('../utils/confirmOrderHelper');
const { logPlatformEvent, getRequestMeta } = require('../utils/platformLogger');
const { parseJsonObject } = require('../utils/jsonField');

const generateOrderRef = () =>
  'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase();

const PG_UNIQUE_VIOLATION = '23505';
const PENDING_ORDER_TTL_MINUTES = 30;

const getSettingsMap = async (client, keys = []) => {
  if (!keys.length) return {};
  const res = await client.query(
    `SELECT key, value FROM platform_settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  const out = {};
  res.rows.forEach((r) => { out[r.key] = r.value; });
  return out;
};

const asBool = (v, fallback = true) => {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).toLowerCase() === 'true';
};

const asPosInt = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const parseNotes = (value) => parseJsonObject(value, {});

const pendingOrderExpirySql = `NOW() + INTERVAL '${PENDING_ORDER_TTL_MINUTES} minutes'`;

async function expireStalePendingOrders(client, { userId = null, eventId = null, orderId = null } = {}) {
  const params = [];
  const where = [`status = 'pending'`, `expires_at IS NOT NULL`, `expires_at < NOW()`];

  if (userId) where.push(`user_id = $${params.push(userId)}`);
  if (eventId) where.push(`event_id = $${params.push(eventId)}`);
  if (orderId) where.push(`id = $${params.push(orderId)}`);

  await client.query(
    `UPDATE orders
     SET status = 'expired', updated_at = NOW()
     WHERE ${where.join(' AND ')}`,
    params
  );
}

const buildOrderRequestKey = ({
  userId,
  eventId,
  attendeeName,
  attendeeEmail,
  attendeePhone,
  promoCode,
  items,
}) => {
  const normalizedItems = [...items]
    .map((item) => ({
      ticket_type_id: item.ticket_type_id,
      quantity: Number(item.quantity || 0),
    }))
    .sort((a, b) => String(a.ticket_type_id).localeCompare(String(b.ticket_type_id)));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      user_id: userId,
      event_id: eventId,
      attendee_name: attendeeName.trim(),
      attendee_email: attendeeEmail.trim().toLowerCase(),
      attendee_phone: attendeePhone.trim(),
      promo_code: (promoCode || '').trim().toUpperCase(),
      items: normalizedItems,
    }))
    .digest('hex');
};

// ── POST /api/orders ─────────────────────────────────────────
const createOrder = async (req, res) => {
  const {
    event_id, attendee_name, attendee_email,
    attendee_phone, items, promo_code,
  } = req.body;

  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      message: 'You must be logged in to buy tickets',
    });
  }
  if (req.user.role !== 'user') {
    return res.status(403).json({
      success: false,
      message: 'Only attendee accounts can buy tickets',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expireStalePendingOrders(client, { userId: req.user.id, eventId: event_id });

    const settings = await getSettingsMap(client, [
      'security_fraud_auto_block',
      'security_max_orders_per_hour_per_ip',
    ]);
    const fraudAutoBlock = asBool(settings.security_fraud_auto_block, true);
    const maxOrdersPerHour = asPosInt(settings.security_max_orders_per_hour_per_ip, 20);

    if (fraudAutoBlock) {
      const recent = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM orders
         WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '1 hour'`,
        [req.user.id]
      );
      const totalRecent = recent.rows[0]?.total || 0;
      if (totalRecent >= maxOrdersPerHour) {
        throw new Error(`Too many order attempts. Please wait and try again later.`);
      }
    }

    const evRes = await client.query(
      `SELECT e.id, e.title, e.status, o.commission
       FROM events e
       JOIN organizers o ON o.id = e.organizer_id
       WHERE e.id = $1`,
      [event_id]
    );
    if (!evRes.rows[0])                       throw new Error('Event not found');
    if (evRes.rows[0].status !== 'published') throw new Error('This event is not available for booking');

    let subtotal = 0;
    const resolvedItems = [];

    for (const item of items) {
      const ttRes = await client.query(
        `SELECT id, name, price, quantity, sold, is_active
         FROM ticket_types WHERE id = $1 AND event_id = $2`,
        [item.ticket_type_id, event_id]
      );
      const tt = ttRes.rows[0];
      if (!tt)           throw new Error('Ticket type not found');
      if (!tt.is_active) throw new Error(`"${tt.name}" tickets are no longer available`);
      const available = tt.quantity - tt.sold;
      if (available < item.quantity) {
        throw new Error(`Only ${available} "${tt.name}" ticket(s) remaining`);
      }
      const lineTotal = Number(tt.price) * item.quantity;
      subtotal += lineTotal;
      resolvedItems.push({ ...tt, quantity: item.quantity, subtotal: lineTotal });
    }

    let discount = 0;
    let appliedPromo = null;
    if (promo_code) {
      const promoRes = await client.query(
        `SELECT * FROM promo_codes
         WHERE code = $1 AND is_active = TRUE
           AND (max_uses IS NULL OR used_count < max_uses)
           AND (valid_from  IS NULL OR valid_from  <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())`,
        [promo_code.toUpperCase()]
      );
      if (promoRes.rows[0]) {
        const p = promoRes.rows[0];
        discount = p.discount_type === 'percent'
          ? +(subtotal * Number(p.discount_value) / 100).toFixed(2)
          : Math.min(Number(p.discount_value), subtotal);
        appliedPromo = {
          id: p.id,
          code: p.code,
          discount,
        };
      }
    }

    const discountedSubtotal = subtotal - discount;
    const commissionAmt      = +(discountedSubtotal * Number(evRes.rows[0].commission) / 100).toFixed(2);
    const total              = discountedSubtotal;
    const orderRequestKey = buildOrderRequestKey({
      userId: req.user.id,
      eventId: event_id,
      attendeeName: attendee_name || req.user.name || '',
      attendeeEmail: attendee_email || req.user.email || '',
      attendeePhone: attendee_phone,
      promoCode: promo_code,
      items,
    });

    const existingPending = await client.query(
      `SELECT id, order_ref, subtotal, total, notes
       FROM orders
       WHERE user_id = $1
         AND event_id = $2
         AND status = 'pending'
         AND (expires_at IS NULL OR expires_at >= NOW())
         AND notes::jsonb ->> 'order_request_key' = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id, event_id, orderRequestKey]
    );
    if (existingPending.rows[0]) {
      const existing = existingPending.rows[0];
      const notes = parseNotes(existing.notes);
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Reusing existing pending order',
        data: {
          order_id: existing.id,
          order_ref: existing.order_ref,
          subtotal: Number(existing.subtotal),
          discount: Number(notes.promo_discount || 0),
          total: Number(existing.total),
        },
      });
    }

    const orderId = uuidv4();
    const orderPayload = [
      orderId,
      null,
      req.user.id,
      event_id,
      (attendee_name || req.user.name || '').trim(),
      (attendee_email || req.user.email || '').trim().toLowerCase(),
      attendee_phone.trim(),
      subtotal,
      commissionAmt,
      total,
      JSON.stringify({
        ip: req.ip || null,
        user_agent: req.get('user-agent') || null,
        created_by: 'checkout',
        order_request_key: orderRequestKey,
        promo_code_id: appliedPromo?.id || null,
        promo_code: appliedPromo?.code || null,
        promo_discount: appliedPromo?.discount || 0,
      }),
    ];

    let orderRef = null;
    let inserted = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      orderRef = generateOrderRef();
      orderPayload[1] = orderRef;
      try {
        await client.query(
          `INSERT INTO orders
             (id, order_ref, user_id, event_id, attendee_name, attendee_email,
              attendee_phone, subtotal, commission_amt, total, status, expires_at, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',${pendingOrderExpirySql},$11)`,
          orderPayload
        );
        inserted = true;
        break;
      } catch (err) {
        if (err.code !== PG_UNIQUE_VIOLATION) throw err;
      }
    }
    if (!inserted || !orderRef) {
      throw new Error('Could not generate a unique order reference. Please try again.');
    }

    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items
           (id, order_id, ticket_type_id, quantity, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), orderId, item.id, item.quantity, item.price, item.subtotal]
      );
    }

    await client.query('COMMIT');
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'order',
      eventType: 'order_created',
      entityType: 'order',
      entityId: orderId,
      summary: `Order ${orderRef} created`,
      payload: {
        order_ref: orderRef,
        event_id,
        item_count: resolvedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        subtotal,
        discount,
        total,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.status(201).json({
      success: true,
      message: 'Order created',
      data: { order_id: orderId, order_ref: orderRef, subtotal, discount, total },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createOrder:', err.message);
    await logPlatformEvent({
      actorUserId: req.user?.id || null,
      actorRole: req.user?.role || 'guest',
      domain: 'order',
      eventType: 'order_creation_failed',
      entityType: 'order',
      summary: 'Order creation failed',
      severity: 'warning',
      payload: {
        event_id,
        attendee_email: attendee_email || null,
        reason: err.message,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// ── POST /api/orders/:id/confirm ─────────────────────────────
const confirmOrder = async (req, res) => {
  const { id }                               = req.params;
  const { txn_ref, method, provider_data }   = req.body;
  let order;
  let isFreeOrder = false;

  try {
    order = await queryOne(
      `SELECT id, user_id, attendee_email, total, status, expires_at
       FROM orders
       WHERE id = $1`,
      [id]
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.user_id !== req.user.id && order.attendee_email !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Not authorized for this order' });
    }
    if (order.status === 'expired' || (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date())) {
      await query(
        `UPDATE orders
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [id]
      ).catch(() => {});
      return res.status(410).json({ success: false, message: 'This pending order has expired. Please create a new order.' });
    }

    isFreeOrder = Number(order.total) === 0;
    const isSimulation = process.env.NODE_ENV !== 'production' && typeof txn_ref === 'string' && txn_ref.startsWith('SIM');
    if (!isFreeOrder && !isSimulation) {
      return res.status(403).json({
        success: false,
        message: 'Paid orders are confirmed only by the payment callback',
      });
    }
    if (isFreeOrder && method && method !== 'free') {
      return res.status(422).json({ success: false, message: 'Free orders must use free confirmation' });
    }
  } catch (err) {
    console.error('confirmOrder precheck:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await confirmOrderInDB(
      client,
      id,
      txn_ref,
      isFreeOrder ? 'free' : (method || 'mpesa'),
      provider_data || null
    );
    await client.query('COMMIT');

    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'order',
      eventType: result.already_confirmed ? 'order_confirmed_repeat' : 'order_confirmed',
      entityType: 'order',
      entityId: id,
      summary: `Order ${result.order_ref} confirmed`,
      payload: {
        order_ref: result.order_ref,
        ticket_count: result.tickets?.length || 0,
        method: isFreeOrder ? 'free' : (method || 'mpesa'),
      },
      ...getRequestMeta(req),
    }).catch(() => {});

    return res.json({
      success: true,
      message: result.already_confirmed ? 'Already confirmed' : 'Order confirmed and tickets issued',
      data: { order_ref: result.order_ref, tickets: result.tickets },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('confirmOrder:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

// ── GET /api/orders/my ───────────────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'organizer') {
      const org = await queryOne(
        `SELECT id FROM organizers WHERE user_id = $1`, [req.user.id]
      );
      if (!org) return res.json({ success: true, data: [] });
      const r = await query(
        `SELECT o.*, e.title AS event_title, e.banner_url, e.event_date, e.location
         FROM orders o JOIN events e ON e.id = o.event_id
         WHERE e.organizer_id = $1 ORDER BY o.created_at DESC`, [org.id]
      );
      rows = r.rows;
    } else if (req.user.role === 'admin') {
      const r = await query(
        `SELECT o.*, e.title AS event_title, e.banner_url, e.event_date, e.location
         FROM orders o JOIN events e ON e.id = o.event_id
         ORDER BY o.created_at DESC LIMIT 200`
      );
      rows = r.rows;
    } else {
      const r = await query(
        `SELECT o.*, e.title AS event_title, e.banner_url, e.event_date, e.location
         FROM orders o JOIN events e ON e.id = o.event_id
         WHERE o.user_id = $1 ORDER BY o.created_at DESC`, [req.user.id]
      );
      rows = r.rows;
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getMyOrders:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/orders/my/tickets ───────────────────────────────
const getMyTickets = async (req, res) => {
  try {
    const r = await query(
      `SELECT t.*, tt.name AS ticket_type_name, tt.price, tt.color,
              e.title AS event_title, e.banner_url, e.event_date, e.start_time, e.location,
              ord.order_ref
       FROM tickets t
       JOIN ticket_types tt ON tt.id  = t.ticket_type_id
       JOIN events e        ON e.id   = t.event_id
       JOIN orders ord      ON ord.id = t.order_id
       WHERE t.user_id = $1 ORDER BY t.issued_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('getMyTickets:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/orders (admin) ───────────────────────────────────
const getAllOrders = async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const params = [];
  const where  = status ? `WHERE o.status = $${params.push(status)}` : '';

  try {
    const r = await query(
      `SELECT o.*, e.title AS event_title, u.name AS user_name
       FROM orders o
       LEFT JOIN events e ON e.id = o.event_id
       LEFT JOIN users u  ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.push(parseInt(limit, 10))} OFFSET $${params.push(offset)}`,
      params
    );
    return res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('getAllOrders:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ── GET /api/orders/:id/status ────────────────────────────────
// Lightweight polling endpoint — returns only the order status
// and (when confirmed) the tickets. Used by the checkout page
// after an M-PESA STK push while waiting for the callback.
const getOrderStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const order = await queryOne(
      `SELECT o.id, o.status, o.order_ref, o.expires_at,
              o.attendee_email, o.user_id
       FROM orders o
       WHERE o.id = $1`,
      [id]
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    // Only the order owner or an admin may poll.
    // Guest orders have user_id = null, so also allow if the
    // authenticated user's email matches the attendee email.
    const isOwner = order.user_id === req.user.id ||
                    order.attendee_email === req.user.email;
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date()) {
      await query(
        `UPDATE orders
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [id]
      ).catch(() => {});
      return res.json({
        success: true,
        data: { status: 'expired', order_ref: order.order_ref, tickets: [] },
      });
    }

    // If already confirmed, include the tickets so the frontend
    // can render the confirmation step immediately
    if (order.status === 'success') {
      const ticketsRes = await query(
        `SELECT t.id, t.ticket_code AS code, tt.name AS type,
                t.seat_number AS seat, t.qr_url AS qr
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         WHERE t.order_id = $1`,
        [id]
      );
      return res.json({
        success: true,
        data: {
          status:    order.status,
          order_ref: order.order_ref,
          tickets:   ticketsRes.rows,
        },
      });
    }

    return res.json({
      success: true,
      data: { status: order.status, order_ref: order.order_ref, tickets: [] },
    });
  } catch (err) {
    console.error('getOrderStatus:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createOrder, confirmOrder, getOrderStatus, getMyOrders, getMyTickets, getAllOrders };
