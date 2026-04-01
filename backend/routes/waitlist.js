// routes/waitlist.js
const router = require('express').Router();
const { joinWaitlist, getWaitlist } = require('../controllers/waitlistController');
const { authenticate, requireOrganizer } = require('../middleware/auth');
const { body, param }                    = require('express-validator');
const { validate }                       = require('../middleware/validate');

const joinRules = [
  body('event_id').isUUID().withMessage('Valid event ID required'),
  body('name').trim().notEmpty().isLength({ max: 150 }).withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('phone').optional({ nullable: true, checkFalsy: true })
    .matches(/^\+?[\d\s\-()\\.]{7,20}$/).withMessage('Invalid phone'),
];

// Public — anyone can join a waitlist (optionally authenticated)
router.post('/', joinRules, validate, joinWaitlist);

// Organiser / admin — view the waitlist
router.get('/:eventId',
  authenticate, requireOrganizer,
  [param('eventId').isUUID()], validate,
  getWaitlist
);

module.exports = router;
