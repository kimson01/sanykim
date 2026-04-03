const router = require('express').Router();
const { param } = require('express-validator');
const { authenticate, requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  getMyNotifications,
  readNotification,
  readAllNotifications,
} = require('../controllers/notificationsController');

router.get('/', authenticate, requireUser, getMyNotifications);
router.post('/read-all', authenticate, requireUser, readAllNotifications);
router.post(
  '/:id/read',
  authenticate,
  requireUser,
  [param('id').isUUID().withMessage('Invalid notification ID')],
  validate,
  readNotification
);

module.exports = router;
