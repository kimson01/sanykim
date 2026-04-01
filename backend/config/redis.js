require('dotenv').config();

const REDIS_URL = (process.env.REDIS_URL || '').trim();
const REDIS_PREFIX = (process.env.REDIS_PREFIX || 'eventflow').trim();

let createClientFn = null;
let warnedMissingPackage = false;
let warnedDisabled = false;
let clientPromise = null;

try {
  ({ createClient: createClientFn } = require('redis'));
} catch (_) {
  createClientFn = null;
}

function isRedisConfigured() {
  return Boolean(REDIS_URL);
}

function prefixed(key) {
  return `${REDIS_PREFIX}:${key}`;
}

async function getRedisClient() {
  if (!isRedisConfigured()) {
    if (!warnedDisabled) {
      console.log('[redis] disabled (set REDIS_URL to enable shared cache)');
      warnedDisabled = true;
    }
    return null;
  }

  if (!createClientFn) {
    if (!warnedMissingPackage) {
      console.warn('[redis] package not installed; falling back to in-memory cache');
      warnedMissingPackage = true;
    }
    return null;
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createClientFn({ url: REDIS_URL });
      client.on('error', (err) => {
        console.error('[redis] client error:', err.message);
      });
      await client.connect();
      console.log('[redis] connected');
      return client;
    })().catch((err) => {
      console.error('[redis] connection failed:', err.message);
      clientPromise = null;
      return null;
    });
  }

  return clientPromise;
}

async function getJson(key) {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const value = await client.get(prefixed(key));
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error('[redis] getJson failed:', err.message);
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  const client = await getRedisClient();
  if (!client) return false;

  try {
    await client.set(prefixed(key), JSON.stringify(value), ttlSeconds ? { EX: ttlSeconds } : undefined);
    return true;
  } catch (err) {
    console.error('[redis] setJson failed:', err.message);
    return false;
  }
}

async function del(key) {
  const client = await getRedisClient();
  if (!client) return false;

  try {
    await client.del(prefixed(key));
    return true;
  } catch (err) {
    console.error('[redis] del failed:', err.message);
    return false;
  }
}

async function quitRedis() {
  const client = await clientPromise;
  if (!client) return;
  try {
    await client.quit();
  } catch (err) {
    console.error('[redis] quit failed:', err.message);
  } finally {
    clientPromise = null;
  }
}

module.exports = {
  REDIS_PREFIX,
  isRedisConfigured,
  getRedisClient,
  getJson,
  setJson,
  del,
  quitRedis,
};
