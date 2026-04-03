// routes/payments.js
const router = require('express').Router();
const { stkPush, mpesaCallback, simulatePayment } = require('../controllers/paymentController');
const { authenticate, requireRole }                = require('../middleware/auth');
const { stkPushRules, validate }                   = require('../middleware/validate');
const {
  stkPushLimiter,
  simulatePaymentLimiter,
  mpesaCallbackLimiter,
} = require('../middleware/endpointRateLimits');

router.post('/mpesa/stkpush',  authenticate, requireRole('user'), stkPushLimiter, stkPushRules, validate, stkPush);
router.post('/mpesa/callback', mpesaCallbackLimiter, mpesaCallback);   // no auth — called by Safaricom
router.post('/simulate',       authenticate, requireRole('user'), simulatePaymentLimiter, simulatePayment);

module.exports = router;
