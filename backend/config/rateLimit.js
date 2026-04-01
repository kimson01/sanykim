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

module.exports = { createSharedRateLimitStore };
