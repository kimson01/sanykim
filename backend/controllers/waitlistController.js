// controllers/waitlistController.js
const { query, queryOne } = require('../config/db');
const { v4: uuidv4 }      = require('uuid');
const { sendWaitlistEmail } = require('../utils/mailer');

// ── POST /api/waitlist ────────────────────────────────────────
// Join the waitlist for a sold-out event.
const joinWaitlist = async (req, res) => {
  const { event_id, name, email, phone } = req.body;

  try {
    // Verify event exists and is actually sold out
    const event = await queryOne(
      `SELECT id, title, event_date, start_time, location,
              capacity, total_sold, status
       FROM events WHERE id = $1`,
      [event_id]
    );
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.status !== 'published') {
      return res.status(400).json({ success: false, message: 'Event is not available' });
    }

    // Check if there are actually tickets left (no need to waitlist)
    const remaining = event.capacity - event.total_sold;
    if (remaining > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tickets are still available — go ahead and purchase one',
      });
    }

    // Upsert — if already on waitlist, update name/phone silently
    await query(
      `INSERT INTO waitlist (id, event_id, user_id, name, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (event_id, email) DO UPDATE
         SET name = EXCLUDED.name,
             phone = EXCLUDED.phone`,
      [
        uuidv4(), event_id,
        req.user?.id || null,
        name.trim(),
        email.toLowerCase().trim(),
        phone?.trim() || null,
      ]
    );

    // Return position on waitlist
    const pos = await queryOne(
      `SELECT COUNT(*) AS position
       FROM waitlist
       WHERE event_id = $1
         AND notified = FALSE
         AND created_at <= (
           SELECT created_at FROM waitlist
           WHERE event_id = $1 AND email = $2
         )`,
      [event_id, email.toLowerCase().trim()]
    );

    return res.status(201).json({
      success: true,
      message: "You're on the waitlist — we'll email you the moment a ticket becomes available.",
      data: { position: parseInt(pos?.position || 1, 10) },
    });
  } catch (err) {
    console.error('joinWaitlist:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/waitlist/:eventId ────────────────────────────────
// Admin / organiser: see the full waitlist for an event
const getWaitlist = async (req, res) => {
  const { eventId } = req.params;
  try {
    const rows = await query(
      `SELECT w.*, u.name AS user_name
       FROM waitlist w
       LEFT JOIN users u ON u.id = w.user_id
       WHERE w.event_id = $1
       ORDER BY w.created_at ASC`,
      [eventId]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    console.error('getWaitlist:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── notifyNextOnWaitlist ──────────────────────────────────────
// Called internally after a refund frees up a ticket.
// Finds the next unnotified person and emails them.
const notifyNextOnWaitlist = async (eventId) => {
  try {
    const event = await queryOne(
      `SELECT id, title, event_date, start_time, location FROM events WHERE id = $1`,
      [eventId]
    );
    if (!event) return;

    // Get the next person (oldest entry, not yet notified)
    const next = await queryOne(
      `SELECT id, name, email FROM waitlist
       WHERE event_id = $1 AND notified = FALSE
       ORDER BY created_at ASC LIMIT 1`,
      [eventId]
    );
    if (!next) return; // nobody waiting

    // Mark as notified first (prevents duplicate sends on retry)
    await query(
      `UPDATE waitlist
       SET notified = TRUE, notified_at = NOW()
       WHERE id = $1`,
      [next.id]
    );

    const clientUrl    = process.env.CLIENT_URL || 'http://localhost:3000';
    const checkoutUrl  = `${clientUrl}/checkout/${eventId}`;

    sendWaitlistEmail({
      to:          next.email,
      name:        next.name,
      event,
      checkoutUrl,
      hoursToAct:  24,
    }).catch(err => console.error('[waitlist] email error:', err.message));

    console.log(`[waitlist] Notified ${next.email} for event ${event.title}`);
  } catch (err) {
    console.error('[waitlist] notifyNext error:', err.message);
  }
};

module.exports = { joinWaitlist, getWaitlist, notifyNextOnWaitlist };
