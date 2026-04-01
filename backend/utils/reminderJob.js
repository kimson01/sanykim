// utils/reminderJob.js
// Polls for events happening 23–25 hours from now and sends
// a reminder email to all distinct attendees who haven't been reminded yet.
//
// Runs automatically when the server starts (via server.js).
// Uses a simple DB flag (reminder_sent column on attendees) to avoid duplicate sends.
// No external scheduler dependency — uses setInterval.

const { query } = require('../config/db');
const { sendReminderEmail } = require('./mailer');
const { isDbConnectivityError } = require('./dbErrors');

// How often to check (every 30 minutes)
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
let lastConnectivityLogAt = 0;

async function runReminderCheck() {
  try {
    // Find events starting in 23–25 hours from now
    const eventsRes = await query(
      `SELECT e.id, e.title, e.event_date, e.start_time, e.location,
              e.location_type, e.virtual_url
       FROM events e
       WHERE e.status = 'published'
         AND (e.event_date + e.start_time::interval) BETWEEN NOW() + INTERVAL '23 hours'
                                                          AND NOW() + INTERVAL '25 hours'`
    );

    if (!eventsRes.rows.length) return;

    for (const event of eventsRes.rows) {
      // Get attendees who haven't received a reminder yet for this event
      const attendeesRes = await query(
        `SELECT DISTINCT ON (a.email)
                a.id, a.name, a.email,
                COUNT(t.id) OVER (PARTITION BY a.email) AS ticket_count
         FROM attendees a
         JOIN tickets t ON t.order_id = a.order_id AND t.event_id = a.event_id
         WHERE a.event_id = $1
           AND a.reminder_sent IS NOT TRUE`,
        [event.id]
      );

      for (const attendee of attendeesRes.rows) {
        // Mark as sent first (optimistic — prevents double-send on retries)
        await query(
          `UPDATE attendees SET reminder_sent = TRUE
           WHERE event_id = $1 AND email = $2`,
          [event.id, attendee.email]
        );

        // Fire email (non-blocking)
        sendReminderEmail({
          to:           attendee.email,
          attendeeName: attendee.name,
          event,
          ticketCount:  parseInt(attendee.ticket_count, 10) || 1,
        }).catch(err => console.error('[reminderJob] email error:', err.message));
      }
    }
  } catch (err) {
    // Never crash the server — just log
    if (isDbConnectivityError(err)) {
      const now = Date.now();
      if (now - lastConnectivityLogAt > 60 * 1000) {
        console.error('[reminderJob] DB unavailable:', err.message);
        lastConnectivityLogAt = now;
      }
      return;
    }
    console.error('[reminderJob] check error:', err.message);
  }
}

function startReminderJob() {
  console.log('  Reminder job   running every 30 min');
  // Run once immediately on start, then on interval
  runReminderCheck();
  setInterval(runReminderCheck, CHECK_INTERVAL_MS);
}

module.exports = { CHECK_INTERVAL_MS, runReminderCheck, startReminderJob };
