// routes/tickets.js
const router = require('express').Router();
const { scanTicket, getTicket, getEventTickets } = require('../controllers/ticketController');
const { authenticate }                            = require('../middleware/auth');
const { scanTicketRules, validate }               = require('../middleware/validate');
const { queryOne, query }                         = require('../config/db');
const { streamTicketPDF }                         = require('../utils/pdfTicket');

router.post('/scan',          authenticate, scanTicketRules, validate, scanTicket);
router.get('/event/:eventId', authenticate, getEventTickets);
router.get('/:code',          authenticate, getTicket);

// GET /api/tickets/order/:orderId/pdf — download all tickets for an order as PDF
router.get('/order/:orderId/pdf', authenticate, async (req, res) => {
  const { orderId } = req.params;
  try {
    // Load order — user can only download their own; admin can download any
    const order = await queryOne(
      `SELECT o.id, o.order_ref, o.attendee_name, o.attendee_email, o.user_id,
              e.title, e.event_date, e.start_time, e.location,
              org.user_id AS organizer_user_id
       FROM orders o
       JOIN events e ON e.id = o.event_id
       LEFT JOIN organizers org ON org.id = e.organizer_id
       WHERE o.id = $1 AND o.status = 'success'`,
      [orderId]
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (req.user.role === 'user' && order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (req.user.role === 'organizer' && order.organizer_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Load tickets for this order
    const ticketsRes = await query(
      `SELECT t.ticket_code, t.seat_number, t.qr_data,
              tt.name AS ticket_type_name
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
       WHERE t.order_id = $1
       ORDER BY t.issued_at`,
      [orderId]
    );
    if (!ticketsRes.rows.length) {
      return res.status(404).json({ success: false, message: 'No tickets found for this order' });
    }

    const event = {
      title:      order.title,
      event_date: order.event_date,
      start_time: order.start_time,
      location:   order.location,
    };
    const orderInfo = {
      order_ref:      order.order_ref,
      attendee_name:  order.attendee_name,
      attendee_email: order.attendee_email,
    };

    await streamTicketPDF(res, orderInfo, event, ticketsRes.rows);
  } catch (err) {
    console.error('PDF download:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'PDF generation failed' });
    }
  }
});

module.exports = router;
