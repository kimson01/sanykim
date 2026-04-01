// routes/events.js
const router = require('express').Router();
const {
  getEvents, getEvent, createEvent, updateEvent,
  updateEventStatus, deleteEvent, getMyEvents,
} = require('../controllers/eventController');
const { authenticate, requireOrganizer, requireAdmin } = require('../middleware/auth');
const {
  createEventRules, updateEventRules, validate,
} = require('../middleware/validate');
const { body, param } = require('express-validator');

// Public
router.get('/', getEvents);

// Organizer
router.get('/organizer/mine', authenticate, requireOrganizer, getMyEvents);
router.post('/',              authenticate, requireOrganizer, createEventRules, validate, createEvent);
router.put('/:id',            authenticate, requireOrganizer, updateEventRules,  validate, updateEvent);
router.delete('/:id',         authenticate, requireOrganizer, deleteEvent);

// Admin only — status/feature toggle
router.patch('/:id/status', authenticate, requireAdmin,
  [
    param('id').isUUID().withMessage('Invalid event ID'),
    body('status').optional().isIn(['draft','published','cancelled','completed']).withMessage('Invalid status'),
    body('is_featured').optional().isBoolean().withMessage('is_featured must be boolean'),
  ],
  validate,
  updateEventStatus
);

// Public — single event (must be after specific paths)
router.get('/:idOrSlug', getEvent);

module.exports = router;
