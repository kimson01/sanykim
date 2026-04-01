// controllers/ticketController.js
const { query, queryOne } = require('../config/db');
const { logPlatformEvent, getRequestMeta } = require('../utils/platformLogger');

function normalizeScannedCode(input) {
  if (input === undefined || input === null) return '';

  const raw = String(input).trim();
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const candidate = parsed.code || parsed.ticket_code || parsed.ticketCode || parsed.ticket_id || parsed.ticketId;
      if (candidate) return String(candidate).trim();
    }
  } catch (_) {
    // Non-JSON inputs should pass through unchanged.
  }

  return raw;
}

async function getOrganizerForUser(userId) {
  if (!userId) return null;
  return queryOne(`SELECT id, user_id FROM organizers WHERE user_id = $1`, [userId]);
}

async function assertOrganizerOwnsEvent(user, eventId) {
  if (user.role === 'admin') return true;

  const organizer = await getOrganizerForUser(user.id);
  if (!organizer) return false;

  const event = await queryOne(
    `SELECT id
     FROM events
     WHERE id = $1
       AND organizer_id = $2`,
    [eventId, organizer.id]
  );
  return Boolean(event);
}

// POST /api/tickets/scan  — scan & validate a ticket
const scanTicket = async (req, res) => {
  const submittedCode = req.body?.code;
  const lookupCode = normalizeScannedCode(submittedCode);
  if (!lookupCode) return res.status(400).json({ success: false, message: 'Ticket code required' });

  try {
    const ticket = await queryOne(
      `SELECT t.*, tt.name AS ticket_type_name,
              e.title AS event_title, e.event_date, e.id AS event_id,
              o.id AS organizer_id, org.user_id AS organizer_user_id
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       JOIN events e ON e.id = t.event_id
       JOIN organizers o ON o.id = e.organizer_id
       LEFT JOIN organizers org ON org.id = e.organizer_id
       WHERE t.ticket_code = $1 OR t.id::text = $1 OR t.qr_data = $2`,
      [lookupCode, String(submittedCode || '').trim()]
    );

    if (!ticket) {
      await logPlatformEvent({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        domain: 'ticket',
        eventType: 'ticket_scan_failed',
        entityType: 'ticket',
        summary: `Ticket scan failed for code ${lookupCode}`,
        severity: 'warning',
        payload: { reason: 'not_found', code: lookupCode, raw_code: String(submittedCode || '').trim() || null },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(404).json({ success: false, message: 'Invalid ticket — not found' });
    }

    // Organizer can only scan tickets for their own events
    if (req.user.role === 'organizer' && ticket.organizer_user_id !== req.user.id) {
      await logPlatformEvent({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        domain: 'ticket',
        eventType: 'ticket_scan_denied',
        entityType: 'ticket',
        entityId: ticket.id,
        summary: `Unauthorized ticket scan attempt for ${ticket.ticket_code}`,
        severity: 'warning',
        payload: { reason: 'wrong_organizer', event_id: ticket.event_id },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(403).json({ success: false, message: 'You cannot scan tickets for this event' });
    }

    if (ticket.is_voided) {
      await logPlatformEvent({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        domain: 'ticket',
        eventType: 'ticket_scan_rejected',
        entityType: 'ticket',
        entityId: ticket.id,
        summary: `Voided ticket ${ticket.ticket_code} rejected at scan`,
        severity: 'warning',
        payload: { reason: 'voided', void_reason: ticket.void_reason, event_id: ticket.event_id },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(409).json({
        success: false,
        message: 'Ticket is voided',
        data: {
          ticket_code: ticket.ticket_code,
          voided_at: ticket.voided_at,
          void_reason: ticket.void_reason,
        },
      });
    }

    if (ticket.is_scanned) {
      await logPlatformEvent({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        domain: 'ticket',
        eventType: 'ticket_scan_duplicate',
        entityType: 'ticket',
        entityId: ticket.id,
        summary: `Duplicate scan blocked for ${ticket.ticket_code}`,
        severity: 'warning',
        payload: { scanned_at: ticket.scanned_at, event_id: ticket.event_id },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(409).json({
        success: false,
        message: 'Ticket already used',
        data: { scanned_at: ticket.scanned_at, ticket_code: ticket.ticket_code },
      });
    }

    // Mark as scanned
    await queryOne(
      `UPDATE tickets SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1 WHERE id = $2`,
      [req.user.id, ticket.id]
    );

    await queryOne(
      `UPDATE attendees SET checked_in = TRUE, checked_in_at = NOW() WHERE ticket_id = $1`,
      [ticket.id]
    );

    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'ticket',
      eventType: 'ticket_scanned',
      entityType: 'ticket',
      entityId: ticket.id,
      summary: `Ticket ${ticket.ticket_code} scanned successfully`,
      payload: {
        event_id: ticket.event_id,
        event_title: ticket.event_title,
        attendee_name: ticket.attendee_name,
        ticket_type: ticket.ticket_type_name,
      },
      ...getRequestMeta(req),
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Valid ticket — entry granted',
      data: {
        ticket_code: ticket.ticket_code,
        event: ticket.event_title,
        event_date: ticket.event_date,
        ticket_type: ticket.ticket_type_name,
        seat_number: ticket.seat_number,
        attendee_name: ticket.attendee_name,
      },
    });
  } catch (err) {
    console.error('scanTicket:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/tickets/:code  — get ticket details
const getTicket = async (req, res) => {
  const { code } = req.params;
  try {
    const ticket = await queryOne(
      `SELECT t.*, tt.name AS ticket_type_name, tt.color, tt.price,
              e.title AS event_title, e.banner_url, e.event_date, e.start_time, e.location,
              org.user_id AS organizer_user_id
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       JOIN events e ON e.id = t.event_id
       LEFT JOIN organizers org ON org.id = e.organizer_id
       WHERE t.ticket_code = $1`,
      [code]
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (req.user.role === 'organizer' && ticket.organizer_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    return res.json({ success: true, data: ticket });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/tickets/event/:eventId  — organizer view all tickets for event
const getEventTickets = async (req, res) => {
  const { eventId } = req.params;
  try {
    const canAccess = await assertOrganizerOwnsEvent(req.user, eventId);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: 'Not authorized for this event' });
    }

    const tickets = await query(
      `SELECT t.*, tt.name AS ticket_type_name, tt.color
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       WHERE t.event_id = $1
       ORDER BY t.issued_at DESC`,
      [eventId]
    );
    return res.json({ success: true, data: tickets.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { scanTicket, getTicket, getEventTickets };
