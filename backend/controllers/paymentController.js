// controllers/paymentController.js — M-PESA Daraja STK Push
const { query, queryOne, pool } = require('../config/db');
const { confirmOrderInDB } = require('../utils/confirmOrderHelper');
const { logPlatformEvent, getRequestMeta } = require('../utils/platformLogger');
const { parseJsonObject } = require('../utils/jsonField');

const MPESA_BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';
const MPESA_CALLBACK_TOKEN = (process.env.MPESA_CALLBACK_TOKEN || '').trim();

const parseNotes = (value) => parseJsonObject(value, {});

const asMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const PG_UNIQUE_VIOLATION = '23505';

function isAuthorizedMpesaCallback(req) {
  if (!MPESA_CALLBACK_TOKEN) {
    return process.env.NODE_ENV !== 'production';
  }
  return req.query?.token === MPESA_CALLBACK_TOKEN;
}

// ── OAuth token ───────────────────────────────────────────────
const getMpesaToken = async () => {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('M-PESA credentials not configured');

  const creds = Buffer.from(`${key}:${secret}`).toString('base64');
  const res   = await fetch(
    `${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` } }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get M-PESA token');
  return data.access_token;
};

// ── POST /api/payments/mpesa/stkpush ─────────────────────────
const stkPush = async (req, res) => {
  const { order_id, phone } = req.body;

  try {
    const order = await queryOne(
      `SELECT id, order_ref, total, status, user_id, attendee_email, notes, expires_at
       FROM orders
       WHERE id = $1`,
      [order_id]
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.user_id !== req.user.id && order.attendee_email !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Not authorized for this order' });
    }
    if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date()) {
      await queryOne(
        `UPDATE orders
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [order.id]
      ).catch(() => {});
      return res.status(410).json({ success: false, message: 'This pending order has expired. Please create a new order.' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Only pending orders can be paid' });
    }

    // Normalise phone: +254712… or 0712… → 254712…
    const formattedPhone = phone.trim().replace(/^\+/, '').replace(/^0/, '254');

    const token     = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password  = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(Number(order.total)),
      PartyA:            formattedPhone,
      PartyB:            process.env.MPESA_SHORTCODE,
      PhoneNumber:       formattedPhone,
      CallBackURL:       process.env.MPESA_CALLBACK_URL,
      AccountReference:  order.order_ref,
      TransactionDesc:   `Sany Adventures ${order.order_ref}`,
    };

    const mpesaRes  = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const mpesaData = await mpesaRes.json();

    if (mpesaData.ResponseCode !== '0') {
      await queryOne(
        `UPDATE orders
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [order.id]
      ).catch((e) => {
        console.error('stkPush mark-failed:', e.message);
      });
      return res.status(400).json({
        success: false,
        message: mpesaData.CustomerMessage || 'STK push failed',
      });
    }

    // Persist the CheckoutRequestID so the callback can look up the order
    const nextNotes = {
      ...parseNotes(order.notes),
      checkout_request_id: mpesaData.CheckoutRequestID,
      merchant_request_id: mpesaData.MerchantRequestID,
      payment_phone: formattedPhone,
      payment_initiated_at: new Date().toISOString(),
    };
    await queryOne(
      `UPDATE orders
       SET notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(nextNotes), order.id]
    );

    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'payment',
      eventType: 'mpesa_stk_push_initiated',
      entityType: 'order',
      entityId: order.id,
      summary: `M-PESA STK push initiated for order ${order.order_ref}`,
      payload: {
        order_ref: order.order_ref,
        amount: Number(order.total),
        checkout_request_id: mpesaData.CheckoutRequestID,
        merchant_request_id: mpesaData.MerchantRequestID,
        phone: formattedPhone,
      },
      ...getRequestMeta(req),
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'STK push sent — check your phone',
      data: {
        checkout_request_id: mpesaData.CheckoutRequestID,
        merchant_request_id: mpesaData.MerchantRequestID,
      },
    });
  } catch (err) {
    console.error('stkPush:', err.message);
    await queryOne(
      `UPDATE orders
       SET status = 'failed', updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'`,
      [order_id]
    ).catch(() => {});
    await logPlatformEvent({
      actorUserId: req.user?.id || null,
      actorRole: req.user?.role || 'user',
      domain: 'payment',
      eventType: 'mpesa_stk_push_failed',
      entityType: 'order',
      entityId: order_id || null,
      summary: 'M-PESA STK push failed',
      severity: 'warning',
      payload: { order_id: order_id || null, reason: err.message },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.status(500).json({ success: false, message: 'M-PESA request failed' });
  }
};

// ── POST /api/payments/mpesa/callback ────────────────────────
// Safaricom calls this endpoint — no authentication.
// On success it locates the order via CheckoutRequestID stored in
// orders.notes and runs the full confirmation flow.
const mpesaCallback = async (req, res) => {
  // Always respond 200 immediately so Safaricom does not retry
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  if (!isAuthorizedMpesaCallback(req)) {
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_rejected',
      entityType: 'payment',
      summary: 'Unauthorized M-PESA callback rejected',
      severity: 'warning',
      payload: {
        reason: MPESA_CALLBACK_TOKEN ? 'invalid_callback_token' : 'missing_callback_token_config',
        ip_address: req.ip || null,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return;
  }

  const callback = req.body?.Body?.stkCallback;
  if (!callback) return;

  const { ResultCode, ResultDesc, CallbackMetadata, CheckoutRequestID } = callback;
  if (!CheckoutRequestID) return;

  let callbackEventId = null;
  try {
    const inserted = await queryOne(
      `INSERT INTO payment_provider_events
         (provider, event_type, event_key, checkout_request_id, result_code, payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (provider, event_type, event_key) DO NOTHING
       RETURNING id`,
      [
        'mpesa',
        'stk_callback',
        CheckoutRequestID,
        CheckoutRequestID,
        Number.isFinite(Number(ResultCode)) ? Number(ResultCode) : null,
        JSON.stringify(req.body || {}),
      ]
    );
    if (!inserted?.id) {
      await logPlatformEvent({
        actorRole: 'system',
        domain: 'payment',
        eventType: 'mpesa_callback_duplicate',
        entityType: 'payment',
        summary: `Duplicate M-PESA callback ignored for ${CheckoutRequestID}`,
        payload: { checkout_request_id: CheckoutRequestID, result_code: ResultCode },
        ...getRequestMeta(req),
      }).catch(() => {});
      return;
    }
    callbackEventId = inserted.id;
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) return;
    console.error('mpesaCallback event insert:', err.message);
    return;
  }

  if (ResultCode !== 0) {
    console.warn(`M-PESA payment failed (${CheckoutRequestID}): ${ResultDesc}`);
    // Mark order as failed so the user can retry
    try {
      await queryOne(
        `UPDATE orders
         SET status = 'failed', updated_at = NOW()
         WHERE notes::jsonb ->> 'checkout_request_id' = $1
           AND status = 'pending'`,
        [CheckoutRequestID]
      );
    } catch (e) {
      console.error('mpesaCallback mark-failed:', e.message);
    }
    await query(
      `UPDATE payment_provider_events
       SET status = 'failed',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [callbackEventId]
    ).catch(() => {});
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_failed',
      entityType: 'payment',
      summary: `M-PESA callback failed for ${CheckoutRequestID}`,
      severity: 'warning',
      payload: { checkout_request_id: CheckoutRequestID, result_code: ResultCode, result_desc: ResultDesc },
    }).catch(() => {});
    return;
  }

  // Extract M-PESA metadata
  const items  = CallbackMetadata?.Item || [];
  const get    = (name) => items.find(i => i.Name === name)?.Value;
  const txnRef = get('MpesaReceiptNumber');
  const amount = get('Amount');
  const phone  = get('PhoneNumber');

  // Find the matching pending order
  let order;
  try {
    order = await queryOne(
      `SELECT id, order_ref, total, expires_at FROM orders
       WHERE notes::jsonb ->> 'checkout_request_id' = $1
         AND status = 'pending'`,
      [CheckoutRequestID]
    );
  } catch (e) {
    console.error('mpesaCallback lookup:', e.message);
    return;
  }

  if (!order) {
    console.warn(`mpesaCallback: no pending order for CheckoutRequestID ${CheckoutRequestID}`);
    await query(
      `UPDATE payment_provider_events
       SET status = 'unmatched',
           txn_ref = $2,
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [callbackEventId, txnRef || null]
    ).catch(() => {});
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_unmatched',
      entityType: 'payment',
      summary: `No pending order matched M-PESA callback ${CheckoutRequestID}`,
      severity: 'warning',
      payload: { checkout_request_id: CheckoutRequestID, txn_ref: txnRef, amount, phone },
    }).catch(() => {});
    return;
  }

  if (order.expires_at && new Date(order.expires_at) < new Date()) {
    await queryOne(
      `UPDATE orders
       SET status = 'expired', updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'`,
      [order.id]
    ).catch(() => {});
    await query(
      `UPDATE payment_provider_events
       SET order_id = $2,
           txn_ref = $3,
           status = 'expired',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [callbackEventId, order.id, txnRef || null]
    ).catch(() => {});
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_expired_order',
      entityType: 'order',
      entityId: order.id,
      summary: `Ignored M-PESA callback for expired order ${order.order_ref}`,
      severity: 'warning',
      payload: { checkout_request_id: CheckoutRequestID, txn_ref: txnRef, amount, phone },
      ...getRequestMeta(req),
    }).catch(() => {});
    return;
  }

  const paidAmount = asMoney(amount);
  const expectedAmount = Math.ceil(Number(order.total));
  if (paidAmount === null || paidAmount !== expectedAmount) {
    try {
      await queryOne(
        `UPDATE orders
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [order.id]
      );
    } catch (e) {
      console.error('mpesaCallback amount-mismatch mark-failed:', e.message);
    }
    await query(
      `UPDATE payment_provider_events
       SET order_id = $2,
           txn_ref = $3,
           status = 'rejected',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [callbackEventId, order.id, txnRef || null]
    ).catch(() => {});
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_amount_mismatch',
      entityType: 'order',
      entityId: order.id,
      summary: `Rejected M-PESA callback for ${order.order_ref} due to amount mismatch`,
      severity: 'warning',
      payload: {
        checkout_request_id: CheckoutRequestID,
        txn_ref: txnRef,
        expected_amount: expectedAmount,
        callback_amount: amount,
        phone,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return;
  }

  // Confirm the order and generate tickets
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await confirmOrderInDB(
      client, order.id, txnRef, 'mpesa', { CheckoutRequestID, amount, phone }
    );
    await client.query('COMMIT');
    await query(
      `UPDATE payment_provider_events
       SET order_id = $2,
           txn_ref = $3,
           status = 'processed',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [callbackEventId, order.id, txnRef || null]
    ).catch(() => {});
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_confirmed',
      entityType: 'order',
      entityId: order.id,
      summary: `Order ${result.order_ref} confirmed via M-PESA callback`,
      payload: {
        order_ref: result.order_ref,
        txn_ref: txnRef,
        checkout_request_id: CheckoutRequestID,
        amount,
        phone,
      },
    }).catch(() => {});
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('mpesaCallback confirmOrder:', e.message);
    try {
      await queryOne(
        `UPDATE orders
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [order.id]
      );
    } catch (markErr) {
      console.error('mpesaCallback confirmOrder mark-failed:', markErr.message);
    }
    await query(
      `UPDATE payment_provider_events
       SET order_id = $2,
           txn_ref = $3,
           status = 'failed',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [callbackEventId, order.id, txnRef || null]
    ).catch(() => {});
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'payment',
      eventType: 'mpesa_callback_processing_failed',
      entityType: 'order',
      entityId: order.id,
      summary: `M-PESA callback processing failed for order ${order.id}`,
      severity: 'error',
      payload: { checkout_request_id: CheckoutRequestID, txn_ref: txnRef, reason: e.message },
    }).catch(() => {});
  } finally {
    client.release();
  }
};

// ── POST /api/payments/simulate ──────────────────────────────
// Development / sandbox only — returns a fake txn_ref so the
// frontend can immediately call POST /orders/:id/confirm.
const simulatePayment = async (req, res) => {
  const { order_id } = req.body;

  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Payment simulation is not available in production',
    });
  }

  const order = await queryOne(
    `SELECT id, status, user_id, attendee_email, expires_at
     FROM orders
     WHERE id = $1`, [order_id]
  );
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (order.user_id !== req.user.id && order.attendee_email !== req.user.email) {
    return res.status(403).json({ success: false, message: 'Not authorized for this order' });
  }
  if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date()) {
    await queryOne(
      `UPDATE orders
       SET status = 'expired', updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'`,
      [order.id]
    ).catch(() => {});
    return res.status(410).json({ success: false, message: 'This pending order has expired. Please create a new order.' });
  }
  if (order.status === 'success') {
    return res.status(409).json({ success: false, message: 'Order already paid' });
  }

  return res.json({
    success: true,
    message: 'Simulated payment success',
    data: {
      txn_ref: 'SIM' + Math.floor(Math.random() * 9_000_000 + 1_000_000),
      method:  'mpesa',
    },
  });
};

module.exports = { stkPush, mpesaCallback, simulatePayment };
