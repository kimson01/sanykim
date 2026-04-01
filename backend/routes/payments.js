// routes/payments.js
const router = require('express').Router();
const { stkPush, mpesaCallback, simulatePayment } = require('../controllers/paymentController');
const { authenticate, requireRole }                = require('../middleware/auth');
const { stkPushRules, validate }                   = require('../middleware/validate');

router.post('/mpesa/stkpush',  authenticate, requireRole('user'), stkPushRules, validate, stkPush);
router.post('/mpesa/callback', mpesaCallback);   // no auth — called by Safaricom
router.post('/simulate',       authenticate, requireRole('user'), simulatePayment);

module.exports = router;
