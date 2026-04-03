// utils/abandonmentJob.js
// Background job that finds orders created 25–35 minutes ago that are
// still in 'pending' status and sends a recovery email.
//
// Runs every 10 minutes. Uses the order's attendee_email + order_ref so
// it works for both logged-in and guest checkouts.
// Guard: only sends one email per order (uses a db flag sent via notes field check).

const { query } = require('../config/db');
const { sendAbandonmentEmail } = require('./mailer');
const { isDbConnectivityError } = require('./dbErrors');
const { parseJsonObject } = require('./jsonField');

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
let lastConnectivityLogAt = 0;

const parseNotes = (value) => parseJsonObject(value, {});

async function runAbandonmentCheck() {
  try {
    // Find pending orders created 25–35 minutes ago (not too early, not too late)
    const ordersRes = await query(
      `SELECT o.id, o.order_ref, o.attendee_name, o.attendee_email,
              o.event_id,
              o.total, o.notes,
              e.title AS event_title, e.event_date, e.start_time, e.location
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.status = 'pending'
         AND o.created_at BETWEEN NOW() - INTERVAL '35 minutes'
                              AND NOW() - INTERVAL '25 minutes'`
    );

    if (!ordersRes.rows.length) return;

    for (const order of ordersRes.rows) {
      const notes = parseNotes(order.notes);
      if (notes.abandonment_sent_at) continue;

      // Mark as sent before emailing (prevents re-send on next check)
      const nextNotes = {
        ...notes,
        abandonment_sent_at: new Date().toISOString(),
      };
      await query(
        `UPDATE orders
         SET notes = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(nextNotes), order.id]
      );

      const clientUrl    = process.env.CLIENT_URL || 'http://localhost:3000';
      const checkoutUrl  = `${clientUrl}/checkout/${order.event_id}`;

      sendAbandonmentEmail({
        to:         order.attendee_email,
        name:       order.attendee_name,
        orderRef:   order.order_ref,
        event: {
          title:      order.event_title,
          event_date: order.event_date,
          start_time: order.start_time,
          location:   order.location,
        },
        total:       order.total,
        checkoutUrl,
      }).catch(err => console.error('[abandonment] email error:', err.message));

      console.log(`[abandonment] Recovery email sent to ${order.attendee_email} for order ${order.order_ref}`);
    }
  } catch (err) {
    if (isDbConnectivityError(err)) {
      const now = Date.now();
      if (now - lastConnectivityLogAt > 60 * 1000) {
        console.error('[abandonmentJob] DB unavailable:', err.message);
        lastConnectivityLogAt = now;
      }
      return;
    }
    console.error('[abandonmentJob] error:', err.message);
  }
}

function startAbandonmentJob() {
  console.log('  Abandonment job running every 10 min');
  runAbandonmentCheck();
  setInterval(runAbandonmentCheck, CHECK_INTERVAL_MS);
}

module.exports = { CHECK_INTERVAL_MS, runAbandonmentCheck, startAbandonmentJob };
