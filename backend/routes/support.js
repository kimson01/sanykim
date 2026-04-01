const router = require('express').Router();
const { body } = require('express-validator');
const { param } = require('express-validator');
const {
  createTicket,
  listTickets,
  getTicket,
  updateTicket,
  deleteTicket,
  listMessages,
  addMessage,
  listTicketEvents,
  submitSupportRequest,
  getMySupportTickets,
  getOrganizerConflicts,
  escalateSupportTicket,
  organizerSettleSupportTicket,
  getAdminConflicts,
  getAdminSupportOverview,
  adminInterveneSupportTicket,
} = require('../controllers/supportController');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole, requireAdmin } = require('../middleware/auth');

const supportRequestRules = [
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Name must be 2-150 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('category')
    .isIn(['payments', 'tickets', 'refunds', 'organizer', 'account', 'technical', 'other'])
    .withMessage('Invalid support category'),
  body('subject').trim().isLength({ min: 4, max: 160 }).withMessage('Subject must be 4-160 characters'),
  body('message').trim().isLength({ min: 15, max: 5000 }).withMessage('Message must be 15-5000 characters'),
  body('order_ref').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 80 }),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('source').optional().isString().isLength({ max: 30 }),
  body('channel').optional().isString().isLength({ max: 30 }),
];
const ticketIdRules = [param('id').isUUID().withMessage('Invalid ticket ID')];
const updateTicketRules = [
  ...ticketIdRules,
  body('status').optional().isIn(['new', 'in_review', 'waiting_organizer', 'resolved', 'closed', 'escalated']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('assigned_admin_id').optional({ nullable: true }).isUUID().withMessage('assigned_admin_id must be a valid UUID'),
  body('resolution_note').optional().isString().isLength({ max: 5000 }),
];
const messageRules = [
  ...ticketIdRules,
  body('body').trim().isLength({ min: 1, max: 10000 }).withMessage('Message must be 1-10000 characters'),
  body('is_internal').optional().isBoolean().withMessage('is_internal must be boolean'),
];

router.get('/tickets', authenticate, requireRole('user', 'organizer', 'admin'), listTickets);
router.post('/tickets',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  supportRequestRules,
  validate,
  createTicket
);
router.get('/tickets/:id',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  ticketIdRules,
  validate,
  getTicket
);
router.patch('/tickets/:id',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  updateTicketRules,
  validate,
  updateTicket
);
router.delete('/tickets/:id',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  ticketIdRules,
  validate,
  deleteTicket
);
router.get('/tickets/:id/messages',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  ticketIdRules,
  validate,
  listMessages
);
router.post('/tickets/:id/messages',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  messageRules,
  validate,
  addMessage
);
router.get('/tickets/:id/events',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  ticketIdRules,
  validate,
  listTicketEvents
);

router.post('/request',
  authenticate,
  requireRole('user', 'organizer', 'admin'),
  supportRequestRules,
  validate,
  submitSupportRequest
);
router.get('/my', authenticate, requireRole('user', 'organizer', 'admin'), getMySupportTickets);
router.get('/organizer', authenticate, requireRole('organizer', 'admin'), getOrganizerConflicts);
router.patch('/organizer/:id/settle',
  authenticate,
  requireRole('organizer'),
  [
    param('id').isUUID(),
    body('action').isIn(['resolved', 'needs_admin']),
    body('note').isString().isLength({ min: 4, max: 5000 }),
  ],
  validate,
  organizerSettleSupportTicket
);
router.patch('/escalate/:id',
  authenticate,
  requireRole('user', 'organizer'),
  [
    param('id').isUUID(),
    body('reason').optional().isString().isLength({ max: 1000 }),
  ],
  validate,
  escalateSupportTicket
);
router.get('/admin/overview', authenticate, requireAdmin, getAdminSupportOverview);
router.get('/admin/conflicts', authenticate, requireAdmin, getAdminConflicts);
router.patch('/admin/conflicts/:id/intervene',
  authenticate,
  requireAdmin,
  [
    param('id').isUUID(),
    body('status').optional().isIn(['new', 'in_review', 'waiting_organizer', 'resolved', 'closed', 'escalated']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('resolution_note').optional().isString().isLength({ max: 5000 }),
  ],
  validate,
  adminInterveneSupportTicket
);

module.exports = router;
