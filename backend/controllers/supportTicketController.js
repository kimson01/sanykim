const supportService = require('../services/supportService');
const { sendSupportRequestEmail } = require('../utils/mailer');

function sendError(res, label, err) {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`${label}:`, err.message);
  }
  return res.status(statusCode).json({ success: false, message: err.message || 'Server error' });
}

const createTicket = async (req, res) => {
  try {
    const result = await supportService.createTicket(req.user, req.body);
    try {
      await sendSupportRequestEmail({
        to: result.support_email,
        requesterName: req.body.name,
        requesterEmail: req.body.email,
        category: req.body.category,
        subject: req.body.subject,
        message: req.body.message,
        orderRef: req.body.order_ref,
        userRole: req.user?.role || 'guest',
      });
    } catch (mailErr) {
      console.error('createTicket email:', mailErr.message);
    }
    return res.status(201).json({
      success: true,
      message: 'Support request submitted successfully',
      data: {
        request_id: result.request_id,
        support_email: result.support_email,
        ticket: result.ticket,
      },
    });
  } catch (err) {
    return sendError(res, 'createTicket', err);
  }
};

const listTickets = async (req, res) => {
  try {
    const result = await supportService.listTickets(req.user, req.query);
    return res.json({ success: true, data: result.data, meta: result.meta });
  } catch (err) {
    return sendError(res, 'listTickets', err);
  }
};

const getTicket = async (req, res) => {
  try {
    const ticket = await supportService.getTicketForActor(req.user, req.params.id);
    return res.json({ success: true, data: ticket });
  } catch (err) {
    return sendError(res, 'getTicket', err);
  }
};

const updateTicket = async (req, res) => {
  try {
    const ticket = await supportService.updateTicket(req.user, req.params.id, req.body);
    return res.json({ success: true, data: ticket });
  } catch (err) {
    return sendError(res, 'updateTicket', err);
  }
};

const escalateTicket = async (req, res) => {
  try {
    const ticket = await supportService.escalateTicket(req.user, req.params.id, req.body.reason);
    return res.json({ success: true, message: 'Ticket escalated', data: ticket });
  } catch (err) {
    return sendError(res, 'escalateTicket', err);
  }
};

const deleteTicket = async (req, res) => {
  try {
    const result = await supportService.softDeleteTicket(req.user, req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    return sendError(res, 'deleteTicket', err);
  }
};

const listTicketEvents = async (req, res) => {
  try {
    const rows = await supportService.listEvents(req.user, req.params.id);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return sendError(res, 'listTicketEvents', err);
  }
};

const getAdminOverview = async (req, res) => {
  try {
    const data = await supportService.getAdminOverview();
    return res.json({ success: true, data });
  } catch (err) {
    return sendError(res, 'getAdminOverview', err);
  }
};

module.exports = {
  createTicket,
  listTickets,
  getTicket,
  updateTicket,
  escalateTicket,
  deleteTicket,
  listTicketEvents,
  getAdminOverview,
};
