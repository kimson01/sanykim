const ticketController = require('./supportTicketController');
const messageController = require('./supportMessageController');
const supportService = require('../services/supportService');

const submitSupportRequest = ticketController.createTicket;

const getMySupportTickets = async (req, res) => {
  req.query.page = req.query.page || 1;
  req.query.limit = req.query.limit || 50;
  return ticketController.listTickets(req, res);
};

const getOrganizerConflicts = async (req, res) => {
  req.query.page = req.query.page || 1;
  req.query.limit = req.query.limit || 100;
  return ticketController.listTickets(req, res);
};

const escalateSupportTicket = ticketController.escalateTicket;

const organizerSettleSupportTicket = async (req, res) => {
  const { action, note } = req.body;
  try {
    if (!String(note || '').trim()) {
      return res.status(400).json({ success: false, message: 'Settlement note is required' });
    }

    if (action === 'needs_admin') {
      await supportService.updateTicket(req.user, req.params.id, {
        resolution_note: note.trim(),
        status: 'escalated',
      });
      const ticket = await supportService.escalateTicket(req.user, req.params.id, note.trim());
      return res.json({
        success: true,
        message: 'Sent to super admin for intervention',
        data: ticket,
      });
    }

    const ticket = await supportService.updateTicket(req.user, req.params.id, {
      status: 'resolved',
      resolution_note: note.trim(),
    });
    return res.json({
      success: true,
      message: 'Dispute marked as resolved',
      data: ticket,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) console.error('organizerSettleSupportTicket:', err.message);
    return res.status(statusCode).json({ success: false, message: err.message || 'Server error' });
  }
};

const getAdminConflicts = async (req, res) => {
  req.query.page = req.query.page || 1;
  req.query.limit = req.query.limit || 100;
  return ticketController.listTickets(req, res);
};

const getAdminSupportOverview = ticketController.getAdminOverview;

const adminInterveneSupportTicket = async (req, res) => {
  try {
    const ticket = await supportService.updateTicket(req.user, req.params.id, {
      status: req.body.status,
      priority: req.body.priority,
      resolution_note: req.body.resolution_note,
      assigned_admin_id: req.user.id,
    });
    return res.json({ success: true, message: 'Intervention saved', data: ticket });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) console.error('adminInterveneSupportTicket:', err.message);
    return res.status(statusCode).json({ success: false, message: err.message || 'Server error' });
  }
};

module.exports = {
  submitSupportRequest,
  getMySupportTickets,
  getOrganizerConflicts,
  escalateSupportTicket,
  organizerSettleSupportTicket,
  getAdminConflicts,
  getAdminSupportOverview,
  adminInterveneSupportTicket,
  createTicket: ticketController.createTicket,
  listTickets: ticketController.listTickets,
  getTicket: ticketController.getTicket,
  updateTicket: ticketController.updateTicket,
  deleteTicket: ticketController.deleteTicket,
  listMessages: messageController.listMessages,
  addMessage: messageController.addMessage,
  listTicketEvents: ticketController.listTicketEvents,
};
