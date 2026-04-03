const { buildRateLimiter } = require('../config/rateLimit');

const keyByUserOrIp = (req) => {
  const userId = req.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
};

const paymentActionMessage = (message) => ({ success: false, message });

const createOrderLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 18,
  keyGenerator: keyByUserOrIp,
  message: paymentActionMessage('Too many checkout attempts. Please wait a moment and try again.'),
});

const confirmOrderLimiter = buildRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: keyByUserOrIp,
  message: paymentActionMessage('Too many confirmation attempts. Please wait and try again.'),
});

const orderStatusLimiter = buildRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: keyByUserOrIp,
  message: paymentActionMessage('Too many payment status checks. Please wait a moment.'),
});

const stkPushLimiter = buildRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  keyGenerator: keyByUserOrIp,
  message: paymentActionMessage('Too many payment prompts sent. Please wait before trying again.'),
});

const simulatePaymentLimiter = buildRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: keyByUserOrIp,
  message: paymentActionMessage('Too many simulated payments. Please wait and try again.'),
});

const mpesaCallbackLimiter = buildRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: paymentActionMessage('Too many payment callbacks.'),
});

module.exports = {
  createOrderLimiter,
  confirmOrderLimiter,
  orderStatusLimiter,
  stkPushLimiter,
  simulatePaymentLimiter,
  mpesaCallbackLimiter,
};
