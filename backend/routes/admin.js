// routes/admin.js
const router = require('express').Router();
const {
  getDashboard, getOrganizers, updateOrganizerStatus, setCommission,
  getEventOptions, getAdminLogs,
  getUsers, getTransactions, getSettings, updateSettings,
  refundOrder, toggleUserActive, updateOrganizerNotes,
  getOrgLedger, recordPayout, getAllPayouts,
} = require('../controllers/adminController');
const { authenticate, requireAdmin }                = require('../middleware/auth');
const { orgStatusRules, commissionRules, validate } = require('../middleware/validate');
const { body, param }                               = require('express-validator');

router.use(authenticate, requireAdmin);

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', getDashboard);
router.get('/events/options', getEventOptions);
router.get('/logs', getAdminLogs);

// ── Organizers ────────────────────────────────────────────────
router.get('/organizers',                    getOrganizers);
router.patch('/organizers/:id/status',       orgStatusRules,  validate, updateOrganizerStatus);
router.patch('/organizers/:id/commission',   commissionRules, validate, setCommission);
router.patch('/organizers/:id/notes',
  [
    param('id').isUUID(),
    body('admin_notes').optional().isString().isLength({ max: 2000 }),
    body('rejection_reason').optional().isString().isLength({ max: 1000 }),
  ],
  validate, updateOrganizerNotes
);
// Ledger — full financial history for one organizer
router.get('/organizers/:id/ledger',
  [param('id').isUUID()], validate, getOrgLedger
);
// Payout — admin records a disbursement to an organizer
router.post('/organizers/:id/payout',
  [
    param('id').isUUID(),
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
    body('method').optional().isIn(['mpesa','bank','cash']).withMessage('Invalid method'),
    body('reference').optional().isString().isLength({ max: 100 }),
    body('note').optional().isString().isLength({ max: 500 }),
  ],
  validate, recordPayout
);

// ── Users ─────────────────────────────────────────────────────
router.get('/users', getUsers);
router.patch('/users/:id/toggle',
  [param('id').isUUID()], validate, toggleUserActive
);

// ── Transactions & payouts ────────────────────────────────────
router.get('/transactions', getTransactions);
router.get('/payouts',      getAllPayouts);
router.post('/orders/:id/refund',
  [
    param('id').isUUID(),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  validate, refundOrder
);

// ── Settings ─────────────────────────────────────────────────
router.get('/settings',    getSettings);
router.put('/settings',    updateSettings);

module.exports = router;
