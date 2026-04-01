// routes/orders.js
const router = require('express').Router();
const {
  createOrder, confirmOrder, getOrderStatus,
  getMyOrders, getMyTickets, getAllOrders,
} = require('../controllers/orderController');
const { authenticate, requireAdmin, requireRole } = require('../middleware/auth');
const {
  createOrderRules, confirmOrderRules, validate,
} = require('../middleware/validate');
const { param } = require('express-validator');

// NOTE: specific paths must come before wildcard /:id paths
router.get('/my',         authenticate, getMyOrders);
router.get('/my/tickets', authenticate, getMyTickets);
router.get('/',           authenticate, requireAdmin, getAllOrders);

router.post('/',                     authenticate, requireRole('user'), createOrderRules,  validate, createOrder);
router.post('/:id/confirm',          authenticate, requireRole('user'), confirmOrderRules, validate, confirmOrder);
router.get('/:id/status',            authenticate,
  [param('id').isUUID().withMessage('Invalid order ID')], validate,
  getOrderStatus
);

module.exports = router;
