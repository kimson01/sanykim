// middleware/validate.js
// Centralised express-validator rule sets + error handler
const { body, param, validationResult } = require('express-validator');

// ── Run result and return 422 on first error ──────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: errors.array()[0].msg,   // surface first error message
      errors:  errors.array(),
    });
  }
  next();
};

// ── Auth ──────────────────────────────────────────────────────
const registerRules = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 150 }).withMessage('Name max 150 characters'),
  body('email')
    .trim().normalizeEmail()
    .isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .isLength({ max: 72 }).withMessage('Password max 72 characters'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Invalid phone number'),
  body('role')
    .optional()
    .isIn(['user', 'organizer']).withMessage('Role must be user or organizer'),
  body('company_name')
    .optional({ nullable: true, checkFalsy: true })
    .trim().isLength({ max: 200 }).withMessage('Company name max 200 characters'),
];

const loginRules = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Valid email is required'),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

// ── Events ────────────────────────────────────────────────────
const createEventRules = [
  body('title')
    .trim().notEmpty().withMessage('Event title is required')
    .isLength({ max: 300 }).withMessage('Title max 300 characters'),
  body('event_date')
    .notEmpty().withMessage('Event date is required')
    .isDate().withMessage('event_date must be a valid date (YYYY-MM-DD)'),
  body('start_time')
    .notEmpty().withMessage('Start time is required')
    .matches(/^\d{2}:\d{2}$/).withMessage('start_time must be HH:MM'),
  body('location')
    .trim().notEmpty().withMessage('Location is required')
    .isLength({ max: 300 }).withMessage('Location max 300 characters'),
  body('location_type')
    .optional()
    .isIn(['physical', 'virtual']).withMessage('location_type must be physical or virtual'),
  body('capacity')
    .optional()
    .isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  body('ticket_types')
    .optional()
    .isArray({ min: 1 }).withMessage('ticket_types must be a non-empty array'),
  body('ticket_types.*.name')
    .optional()
    .trim().notEmpty().withMessage('Each ticket type must have a name'),
  body('ticket_types.*.price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Ticket price must be >= 0'),
  body('ticket_types.*.quantity')
    .optional()
    .isInt({ min: 1 }).withMessage('Ticket quantity must be >= 1'),
];

const updateEventRules = [
  param('id').isUUID().withMessage('Invalid event ID'),
  body('title')
    .optional()
    .trim().notEmpty().withMessage('Title cannot be blank')
    .isLength({ max: 300 }).withMessage('Title max 300 characters'),
  body('event_date')
    .optional()
    .isDate().withMessage('event_date must be YYYY-MM-DD'),
  body('capacity')
    .optional()
    .isInt({ min: 1 }).withMessage('Capacity must be >= 1'),
  body('location_type')
    .optional()
    .isIn(['physical', 'virtual']).withMessage('location_type must be physical or virtual'),
];

// ── Orders ────────────────────────────────────────────────────
const createOrderRules = [
  body('event_id')
    .notEmpty().withMessage('event_id is required')
    .isUUID().withMessage('event_id must be a valid UUID'),
  body('attendee_name')
    .trim().notEmpty().withMessage('Attendee name is required')
    .isLength({ max: 150 }).withMessage('Name max 150 characters'),
  body('attendee_email')
    .trim().normalizeEmail()
    .isEmail().withMessage('Valid attendee email is required'),
  body('attendee_phone')
    .trim().notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Invalid phone number'),
  body('items')
    .isArray({ min: 1 }).withMessage('At least one ticket selection is required'),
  body('items.*.ticket_type_id')
    .notEmpty().withMessage('ticket_type_id is required in each item')
    .isUUID().withMessage('ticket_type_id must be a valid UUID'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 20 }).withMessage('Quantity must be between 1 and 20'),
  body('promo_code')
    .optional({ nullable: true, checkFalsy: true })
    .trim().isLength({ max: 50 }).withMessage('Promo code too long'),
];

const confirmOrderRules = [
  param('id').isUUID().withMessage('Invalid order ID'),
  body('txn_ref')
    .optional({ nullable: true, checkFalsy: true })
    .trim().isLength({ max: 80 }).withMessage('txn_ref too long'),
  body('method')
    .optional()
    .isIn(['mpesa', 'cash', 'free']).withMessage('Invalid payment method'),
];

// ── Tickets ───────────────────────────────────────────────────
const scanTicketRules = [
  body('code')
    .trim().notEmpty().withMessage('Ticket code is required')
    .isLength({ max: 5000 }).withMessage('Code too long'),
];

// ── Payments ─────────────────────────────────────────────────
const stkPushRules = [
  body('order_id')
    .notEmpty().withMessage('order_id is required')
    .isUUID().withMessage('order_id must be a valid UUID'),
  body('phone')
    .trim().notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Invalid phone number'),
];

// ── Admin ─────────────────────────────────────────────────────
const orgStatusRules = [
  param('id').isUUID().withMessage('Invalid organizer ID'),
  body('status')
    .isIn(['approved', 'suspended', 'rejected', 'pending'])
    .withMessage('status must be approved, suspended, rejected or pending'),
];

const commissionRules = [
  param('id').isUUID().withMessage('Invalid organizer ID'),
  body('commission')
    .isFloat({ min: 0, max: 100 }).withMessage('Commission must be between 0 and 100'),
];

// ── Upload ────────────────────────────────────────────────────
const uploadRules = [
  // multer runs before validation, so we validate the resulting file path
];

module.exports = {
  validate,
  registerRules,
  loginRules,
  createEventRules,
  updateEventRules,
  createOrderRules,
  confirmOrderRules,
  scanTicketRules,
  stkPushRules,
  orgStatusRules,
  commissionRules,
};
