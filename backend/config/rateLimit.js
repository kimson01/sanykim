const rateLimit = require('express-rate-limit');
const { getRedisClient, isRedisConfigured } = require('./redis');

let RedisStore = null;
let warnedMissingPackage = false;

try {
  ({ RedisStore } = require('rate-limit-redis'));
} catch (_) {
  RedisStore = null;
}

function createSharedRateLimitStore() {
  if (!isRedisConfigured()) return undefined;

  if (!RedisStore) {
    if (!warnedMissingPackage) {
      console.warn('[rate-limit] rate-limit-redis package not installed; using local rate limits');
      warnedMissingPackage = true;
    }
    return undefined;
  }

  return new RedisStore({
    sendCommand: async (...args) => {
      const client = await getRedisClient();
      if (!client) {
        throw new Error('Redis client unavailable for rate limiting');
      }
      return client.sendCommand(args);
    },
  });
}

const isLocalRequest = (req) => {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('localhost')
  );
};

const shouldSkipRateLimit = (req) =>
  process.env.NODE_ENV !== 'production' && isLocalRequest(req);

function buildRateLimiter({ windowMs, max, message, keyGenerator, skip, ...rest }) {
  const options = {
    windowMs,
    max,
    skip: skip || shouldSkipRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    ...rest,
  };

  if (keyGenerator) options.keyGenerator = keyGenerator;

  const store = createSharedRateLimitStore();
  if (store) options.store = store;

  return rateLimit(options);
}

module.exports = {
  createSharedRateLimitStore,
  buildRateLimiter,
};
