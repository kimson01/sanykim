// utils/confirmOrderHelper.js
// Single source of truth for order confirmation logic.
// Called by both POST /orders/:id/confirm and the M-PESA callback.

const { v4: uuidv4 }        = require('uuid');
const QRCode                 = require('qrcode');
const { sendTicketEmail }    = require('./mailer');
const { logPlatformEvent }   = require('./platformLogger');
const { parseJsonObject }    = require('./jsonField');
const { createOrderConfirmedNotification } = require('./notificationService');

const generateTicketCode = () => {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EF-${seg()}-${seg()}`;
};

const parseNotes = (value) => parseJsonObject(value, {});

const PG_UNIQUE_VIOLATION = '23505';

/**
 * confirmOrderInDB
 * Must be called with an active pg client that has issued BEGIN.
 * The caller is responsible for COMMIT / ROLLBACK.
 *
 * Steps:
 *  1. Lock order row (FOR UPDATE)
 *  2. Idempotency: already confirmed → return early
 *  3. Insert transaction record
 *  4. Mark order status = 'success'
 *  5. Per order_item: update ticket_type.sold + event.total_sold
 *  6. Generate ticket rows + QR base64
 *  7. Insert attendee records
 *  8. Update organizer total_revenue
 *  9. Fire ticket confirmation email (non-blocking)
 *
 * @returns {{ order_ref, tickets, already_confirmed? }}
 */
async function confirmOrderInDB(client, orderId, txnRef, method = 'mpesa', providerData = null) {

  // 1. Lock order row + join event details needed for email
  const orderRes = await client.query(
    `SELECT o.*,
            e.title      AS event_title,
            e.event_date,
            e.start_time,
            e.location,
            e.location_type,
            e.virtual_url
     FROM orders o
     JOIN events e ON e.id = o.event_id
     WHERE o.id = $1
     FOR UPDATE`,
    [orderId]
  );
  if (!orderRes.rows[0]) throw new Error('Order not found');
  const order = orderRes.rows[0];

  // 2. Idempotency
  if (order.status === 'success') {
    return { order_ref: order.order_ref, tickets: [], already_confirmed: true };
  }
  if (!['pending', 'failed'].includes(order.status)) {
    throw new Error(`Order cannot be confirmed from status "${order.status}"`);
  }

  // 3. Transaction record
  const effectiveTxnRef = txnRef || ('FREE-' + uuidv4().slice(0, 8).toUpperCase());
  let transactionRow;
  try {
    const transactionRes = await client.query(
      `INSERT INTO transactions
         (id, order_id, txn_ref, amount, method, status, provider_data)
       VALUES ($1,$2,$3,$4,$5,'success',$6)
       ON CONFLICT (txn_ref)
       DO UPDATE SET provider_data = COALESCE(transactions.provider_data, EXCLUDED.provider_data)
       RETURNING id, order_id, txn_ref`,
      [
        uuidv4(), orderId, effectiveTxnRef,
        order.total, method,
        providerData ? JSON.stringify(providerData) : null,
      ]
    );
    transactionRow = transactionRes.rows[0];
  } catch (err) {
    if (err.code !== PG_UNIQUE_VIOLATION) throw err;
    throw new Error(`Transaction reference ${effectiveTxnRef} is already linked to another payment`);
  }
  if (transactionRow?.order_id !== orderId) {
    throw new Error(`Transaction reference ${effectiveTxnRef} is already linked to another order`);
  }

  // 4. Order status
  await client.query(
    `UPDATE orders SET status = 'success', updated_at = NOW() WHERE id = $1`,
    [orderId]
  );

  // 5–7. Tickets
  const itemsRes = await client.query(
    `SELECT oi.*, tt.name AS ticket_type_name, tt.price
     FROM order_items oi
     JOIN ticket_types tt ON tt.id = oi.ticket_type_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  itemsRes.rows.sort((a, b) => String(a.ticket_type_id).localeCompare(String(b.ticket_type_id)));

  const generatedTickets = [];
  const notes = parseNotes(order.notes);

  for (const item of itemsRes.rows) {
    // 5. Counters
    const ticketTypeUpdate = await client.query(
      `UPDATE ticket_types
       SET sold = sold + $1
       WHERE id = $2
         AND sold + $1 <= quantity
       RETURNING id`,
      [item.quantity, item.ticket_type_id]
    );
    if (!ticketTypeUpdate.rows[0]) {
      throw new Error(`Not enough ${item.ticket_type_name} tickets remaining to confirm this order`);
    }
    await client.query(
      `UPDATE events SET total_sold = total_sold + $1 WHERE id = $2`,
      [item.quantity, order.event_id]
    );

    // 6. One ticket per seat
    for (let i = 0; i < item.quantity; i++) {
      const ticketId = uuidv4();
      const code     = generateTicketCode();
      const seatNo   = `${item.ticket_type_name.slice(0, 3).toUpperCase()}-${100 + i}`;

      const qrPayload = JSON.stringify({
        ticket_id:  ticketId,
        code,
        event:      order.event_title,
        date:       order.event_date,
        type:       item.ticket_type_name,
        attendee:   order.attendee_name,
        order_ref:  order.order_ref,
      });

      const qrBase64 = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1 });

      await client.query(
        `INSERT INTO tickets
           (id, ticket_code, order_id, order_item_id, user_id, event_id,
            ticket_type_id, seat_number, qr_data, qr_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          ticketId, code, orderId, item.id,
          order.user_id, order.event_id, item.ticket_type_id,
          seatNo, qrPayload, qrBase64,
        ]
      );

      // 7. Attendee record
      await client.query(
        `INSERT INTO attendees
           (id, event_id, ticket_id, order_id, user_id, name, email, phone, ticket_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          uuidv4(), order.event_id, ticketId, orderId, order.user_id,
          order.attendee_name, order.attendee_email, order.attendee_phone,
          item.ticket_type_name,
        ]
      );

      generatedTickets.push({ id: ticketId, code, type: item.ticket_type_name, seat: seatNo, qr: qrBase64 });
    }
  }

  // 8. Organizer revenue + ledger entry
  const orgRes = await client.query(
    `SELECT id, available_balance, refund_liability FROM organizers
     WHERE id = (SELECT organizer_id FROM events WHERE id = $1)`,
    [order.event_id]
  );
  if (orgRes.rows[0]) {
    const org = orgRes.rows[0];
    const netToOrg = Number(order.total) - Number(order.commission_amt);
    const currentBalance = Number(org.available_balance || 0);
    const currentLiability = Number(org.refund_liability || 0);
    const liabilityApplied = Math.min(currentLiability, netToOrg);
    const creditedBalance = netToOrg - liabilityApplied;
    const newBalance = currentBalance + creditedBalance;
    const newLiability = currentLiability - liabilityApplied;

    // Update organizer totals
    await client.query(
      `UPDATE organizers
       SET total_revenue     = total_revenue     + $1,
           available_balance = $2,
           refund_liability  = $3,
           updated_at        = NOW()
       WHERE id = $4`,
      [order.total, newBalance, newLiability, org.id]
    );

    // Write ledger entry — sale
    await client.query(
      `INSERT INTO revenue_ledger
         (id, organizer_id, order_id, type,
          gross_amount, commission_amt, net_amount, running_balance, description)
       VALUES ($1,$2,$3,'sale',$4,$5,$6,$7,$8)`,
      [
        uuidv4(), org.id, orderId,
        order.total,
        order.commission_amt,
        netToOrg,
        newBalance,
        liabilityApplied > 0
          ? `Ticket sale — Order ${order.order_ref} (${liabilityApplied.toFixed(2)} applied to refund liability)`
          : `Ticket sale — Order ${order.order_ref}`,
      ]
    );
  }

  if (notes.promo_code_id) {
    await client.query(
      `UPDATE promo_codes
       SET used_count = used_count + 1
       WHERE id = $1`,
      [notes.promo_code_id]
    );
  }

  // 9. Send ticket email (fire-and-forget — don't block the HTTP response)
  setImmediate(() => {
    sendTicketEmail({
      to:           order.attendee_email,
      attendeeName: order.attendee_name,
      orderRef:     order.order_ref,
      event: {
        title:         order.event_title,
        event_date:    order.event_date,
        start_time:    order.start_time,
        location:      order.location,
        location_type: order.location_type,
        virtual_url:   order.virtual_url,
      },
      tickets: generatedTickets,
    }).catch(err => console.error('[confirmOrderInDB] email error:', err.message));
  });

  await logPlatformEvent({
    actorUserId: order.user_id || null,
    actorRole: order.user_id ? 'user' : 'system',
    domain: 'ticket',
    eventType: 'tickets_issued',
    entityType: 'order',
    entityId: orderId,
    summary: `${generatedTickets.length} ticket(s) issued for ${order.order_ref}`,
    payload: {
      order_ref: order.order_ref,
      event_id: order.event_id,
      event_title: order.event_title,
      ticket_count: generatedTickets.length,
      transaction_method: method,
    },
  }, client).catch(() => {});

  await createOrderConfirmedNotification(client, {
    userId: order.user_id,
    orderId,
    orderRef: order.order_ref,
    eventTitle: order.event_title,
    ticketCount: generatedTickets.length,
  }).catch(() => {});

  return { order_ref: order.order_ref, tickets: generatedTickets };
}

module.exports = { confirmOrderInDB };
