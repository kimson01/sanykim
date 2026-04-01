// config/db.js — PostgreSQL connection pool with Neon-safe defaults and retries
require('dotenv').config();
const { Pool } = require('pg');

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isConnectivityError = (err) => {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', '57P01'].includes(code) ||
    msg.includes('connection terminated due to connection timeout') ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('timeout expired') ||
    msg.includes('the server is starting up') ||
    msg.includes('connection reset by peer')
  );
};

const isNeonHost = (host = '') => host.includes('.neon.tech');

const normalizeConnectionString = (raw) => {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    // Neon requires SSL; keep params explicit and compatible with pg/libpq.
    if (!u.searchParams.get('sslmode')) {
      u.searchParams.set('sslmode', 'require');
    }
    if (u.searchParams.get('channel_binding') && !u.searchParams.get('uselibpqcompat')) {
      u.searchParams.set('uselibpqcompat', 'true');
    }
    return u.toString();
  } catch (_) {
    return raw;
  }
};

const connectionString = normalizeConnectionString(process.env.DATABASE_URL);
const runningWithUrl = Boolean(connectionString);
const neonViaUrl = runningWithUrl && (() => {
  try { return isNeonHost(new URL(connectionString).hostname); } catch (_) { return false; }
})();

const useSSL = (() => {
  if (process.env.DB_SSL === 'false') return false;
  // For cloud Postgres/Neon we intentionally skip CA pinning in app code.
  if (runningWithUrl) return { rejectUnauthorized: false };
  if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
  return false;
})();

const basePoolConfig = runningWithUrl
  ? {
      connectionString,
      ssl: useSSL,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     toInt(process.env.DB_PORT, 5432),
      database: process.env.DB_NAME     || 'sanyadventures',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl:      useSSL,
    };

const poolConfig = {
  ...basePoolConfig,
  // Neon serverless works best with smaller pools per app instance.
  max:                     toInt(process.env.DB_POOL_MAX, neonViaUrl ? 8 : 20),
  min:                     toInt(process.env.DB_POOL_MIN, neonViaUrl ? 0 : 2),
  idleTimeoutMillis:       toInt(process.env.DB_IDLE_TIMEOUT, 30000),
  connectionTimeoutMillis: toInt(process.env.DB_CONN_TIMEOUT, neonViaUrl ? 15000 : 5000),
  statement_timeout:       toInt(process.env.DB_STATEMENT_TIMEOUT, 20000),
  query_timeout:           toInt(process.env.DB_QUERY_TIMEOUT, 25000),
  keepAlive:               process.env.DB_KEEP_ALIVE !== 'false',
  keepAliveInitialDelayMillis: toInt(process.env.DB_KEEP_ALIVE_DELAY, 10000),
  maxUses:                 toInt(process.env.DB_MAX_USES, neonViaUrl ? 7500 : 0),
  allowExitOnIdle:         process.env.DB_ALLOW_EXIT_ON_IDLE === 'true',
};

const POOL_CACHE_KEY = '__eventflow_pg_pool__';

function getOrCreatePool() {
  if (globalThis[POOL_CACHE_KEY]) {
    return globalThis[POOL_CACHE_KEY];
  }
  const createdPool = new Pool(poolConfig);
  globalThis[POOL_CACHE_KEY] = createdPool;
  return createdPool;
}

const pool = getOrCreatePool();

pool.on('connect', async (client) => {
  const timeout = toInt(process.env.DB_STATEMENT_TIMEOUT, 20000);
  try {
    await client.query(`SET statement_timeout = ${timeout}`);
  } catch (_) {}
});

pool.on('error', (err) => {
  console.error('[db] Pool error:', err.message);
});

let closingPromise = null;

async function closePool() {
  if (closingPromise) return closingPromise;
  closingPromise = (async () => {
    try {
      await pool.end();
    } finally {
      if (globalThis[POOL_CACHE_KEY] === pool) {
        delete globalThis[POOL_CACHE_KEY];
      }
      closingPromise = null;
    }
  })();
  return closingPromise;
}

const RETRY_ATTEMPTS = toInt(process.env.DB_RETRY_ATTEMPTS, neonViaUrl ? 2 : 0);
const RETRY_BASE_MS  = toInt(process.env.DB_RETRY_BASE_MS, 800);

const shouldRetryQuery = (text, err, attempt) => {
  if (!isConnectivityError(err)) return false;
  if (attempt >= RETRY_ATTEMPTS) return false;
  // Retry readonly queries by default to avoid accidental write duplication.
  const sql = String(text || '').trim().toLowerCase();
  return sql.startsWith('select') || sql.startsWith('with');
};

async function query(text, params = [], opts = {}) {
  const attempts = Number.isFinite(opts.retryAttempts) ? opts.retryAttempts : RETRY_ATTEMPTS;
  let attempt = 0;

  while (true) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      const canRetry =
        (opts.retry === true || shouldRetryQuery(text, err, attempt)) &&
        attempt < attempts;
      if (!canRetry) throw err;
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      await sleep(delay);
      attempt += 1;
    }
  }
}

async function queryOne(text, params, opts) {
  const res = await query(text, params, opts);
  return res.rows[0] || null;
}

async function waitForDb({ attempts, delayMs } = {}) {
  const maxAttempts = Number.isFinite(attempts) ? attempts : toInt(process.env.DB_BOOT_RETRIES, 4);
  const delay = Number.isFinite(delayMs) ? delayMs : toInt(process.env.DB_BOOT_RETRY_DELAY, 1500);
  let lastErr = null;

  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      if (i > 1) console.log(`[db] connected on retry ${i}/${maxAttempts}`);
      return true;
    } catch (err) {
      lastErr = err;
      if (!isConnectivityError(err) || i === maxAttempts) break;
      await sleep(delay * i);
    }
  }

  if (lastErr) {
    console.error('[db] startup check failed:', lastErr.message);
  }
  return false;
}

if (parseInt(process.versions.node.split('.')[0], 10) >= 24) {
  console.warn('[db] Node 24 detected. For maximum pg ecosystem stability, use Node 20 LTS in development/production.');
}

module.exports = { pool, query, queryOne, waitForDb, isConnectivityError, closePool };
