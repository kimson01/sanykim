// server.js — Sany Adventures API Server
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const compression = require('compression');
const path        = require('path');
const { waitForDb, closePool } = require('./config/db');
const { createSharedRateLimitStore } = require('./config/rateLimit');
const { startQueuedBackgroundJobs, stopQueuedBackgroundJobs } = require('./utils/jobQueue');

const app = express();

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

const buildRateLimiter = ({ windowMs, max, message }) => {
  const options = {
    windowMs,
    max,
    skip: shouldSkipRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message,
  };

  const store = createSharedRateLimitStore();
  if (store) options.store = store;

  return rateLimit(options);
};

// ─── Trust proxy ─────────────────────────────────────────────
// When running behind Nginx, Railway, or any reverse proxy, Express
// must trust the X-Forwarded-For header to see the real client IP.
// Without this the rate limiter treats all users as the same IP address,
// meaning one bad request can throttle every user on the platform.
app.set('trust proxy', 1);

// ─── Compression ─────────────────────────────────────────────
// Gzip all text responses > 1KB.
// Reduces JSON payloads by ~70–80% — critical for mobile users.
app.use(compression({
  level:  6,        // balanced CPU/ratio tradeoff
  filter: (req, res) => {
    // Don't compress streamed PDF responses
    if (req.path.includes('/pdf')) return false;
    return compression.filter(req, res);
  },
}));

// ─── Security headers ────────────────────────────────────────
app.use(helmet({
  // HTTP Strict Transport Security — force HTTPS for 1 year
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
  // Prevent MIME sniffing attacks
  noSniff: true,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Remove X-Powered-By: Express header
  hidePoweredBy: true,
  // XSS filter for old browsers
  xssFilter: true,
  // Content Security Policy — adjust as needed
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'",
                   "https://unpkg.com",
                   "https://cdnjs.cloudflare.com",
                   "https://fonts.googleapis.com"],
      styleSrc:   ["'self'", "'unsafe-inline'",
                   "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
    },
  },
}));

app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate limiting ───────────────────────────────────────────
// General API: 300 req / 15 min per IP
app.use('/api/', buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests — try again later' },
}));
// Auth: 20 req / 15 min per IP (brute-force protection)
app.use('/api/auth/', buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts — please wait' },
}));
// Checkout: 60 req / 15 min per IP (prevents ticket-scalping bots)
app.use('/api/orders', buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many order requests — please slow down' },
}));

// ─── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static uploads ──────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads'), {
  maxAge:  '7d',   // browsers cache banner images for 7 days
  etag:    true,
  lastModified: true,
  setHeaders: (res) => {
    // Frontend runs on a different origin in development (localhost:3000),
    // so uploaded assets must be embeddable cross-origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// ─── Health + readiness checks ───────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    brand:   'Sany Adventures',
    env:     process.env.NODE_ENV,
    pid:     process.pid,
    uptime:  Math.round(process.uptime()),
    ts:      new Date().toISOString(),
  });
});

// Readiness: also verifies DB connectivity
app.get('/ready', async (_req, res) => {
  try {
    const { pool } = require('./config/db');
    await pool.query('SELECT 1');
    res.json({ status: 'ready', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', db: err.message });
  }
});

// ─── API routes ──────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/events',   require('./routes/events'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/tickets',  require('./routes/tickets'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/uploads',    require('./routes/uploads'));
app.use('/api/waitlist',   require('./routes/waitlist'));
app.use('/api/organisers', require('./routes/organisers'));
app.use('/api/support',    require('./routes/support'));

// ─── Categories ──────────────────────────────────────────────
app.get('/api/categories', async (_req, res) => {
  try {
    const { query } = require('./config/db');
    const cats = await query(`SELECT id, name, slug FROM categories ORDER BY name`);
    res.json({ success: true, data: cats.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Public settings (safe subset) ───────────────────────────
app.get('/api/settings/public', async (_req, res) => {
  try {
    const { query } = require('./config/db');
    const rows = await query(
      `SELECT key, value
       FROM platform_settings
       WHERE key IN (
         'platform_name',
         'support_email',
         'terms_and_conditions',
         'trust_show_buyer_protection',
         'trust_show_trust_badges',
         'trust_buyer_protection_text'
       )`
    );
    const data = {};
    rows.rows.forEach((r) => { data[r.key] = r.value; });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Organizer analytics ─────────────────────────────────────
app.get(
  '/api/organizer/analytics',
  require('./middleware/auth').authenticate,
  require('./middleware/auth').requireOrganizer,
  async (req, res) => {
    try {
      const { query, queryOne } = require('./config/db');
      const org = await queryOne(
        `SELECT id FROM organizers WHERE user_id = $1`, [req.user.id]
      );
      if (!org) return res.status(404).json({ success: false, message: 'Organizer not found' });

      const [events, revenue, tickets, attendees, topEvents] = await Promise.all([
        queryOne(`SELECT COUNT(*) AS total FROM events WHERE organizer_id = $1`, [org.id]),
        queryOne(
          `SELECT COALESCE(SUM(o.total),0) AS gross, COALESCE(SUM(o.commission_amt),0) AS commission
           FROM orders o JOIN events e ON e.id = o.event_id
           WHERE e.organizer_id = $1 AND o.status = 'success'`, [org.id]
        ),
        queryOne(
          `SELECT COUNT(*) AS total FROM tickets t JOIN events e ON e.id = t.event_id WHERE e.organizer_id = $1`, [org.id]
        ),
        queryOne(
          `SELECT COUNT(*) AS total FROM attendees a JOIN events e ON e.id = a.event_id WHERE e.organizer_id = $1`, [org.id]
        ),
        query(
          `SELECT e.title, e.total_sold, e.capacity,
                  COALESCE(SUM(tt.price * tt.sold), 0) AS revenue
           FROM events e LEFT JOIN ticket_types tt ON tt.event_id = e.id
           WHERE e.organizer_id = $1
           GROUP BY e.id ORDER BY revenue DESC LIMIT 5`, [org.id]
        ),
      ]);

      // Include financial balance data so organizer can see what's owed
      const orgDetail = await queryOne(
        `SELECT commission, available_balance, total_paid_out, total_revenue
         FROM organizers WHERE id = $1`, [org.id]
      );

      res.json({
        success: true,
        data: {
          total_events:      parseInt(events.total, 10),
          gross_revenue:     parseFloat(revenue.gross),
          net_revenue:       parseFloat(revenue.gross) - parseFloat(revenue.commission),
          total_tickets:     parseInt(tickets.total, 10),
          total_attendees:   parseInt(attendees.total, 10),
          top_events:        topEvents.rows,
          commission_rate:   parseFloat(orgDetail?.commission  || 10),
          available_balance: parseFloat(orgDetail?.available_balance || 0),
          total_paid_out:    parseFloat(orgDetail?.total_paid_out    || 0),
        },
      });
    } catch (err) {
      console.error('organizer/analytics:', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─── Organizer sales-by-day ───────────────────────────────────
app.get(
  '/api/organizer/analytics/sales',
  require('./middleware/auth').authenticate,
  require('./middleware/auth').requireOrganizer,
  async (req, res) => {
    try {
      const { queryOne, query } = require('./config/db');
      const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
      const org  = await queryOne(
        `SELECT id FROM organizers WHERE user_id = $1`, [req.user.id]
      );
      if (!org) return res.status(404).json({ success: false, message: 'Organizer not found' });

      const [daily, byType] = await Promise.all([
        query(
          `SELECT DATE_TRUNC('day', o.created_at)::date AS day,
                  COUNT(*) AS orders,
                  COALESCE(SUM(o.total), 0) AS revenue,
                  COALESCE(SUM(oi.quantity), 0) AS tickets
           FROM orders o
           JOIN events e    ON e.id   = o.event_id
           JOIN order_items oi ON oi.order_id = o.id
           WHERE e.organizer_id = $1
             AND o.status = 'success'
             AND o.created_at >= NOW() - ($2 || ' days')::interval
           GROUP BY 1 ORDER BY 1`,
          [org.id, days]
        ),
        query(
          `SELECT tt.name, tt.color, tt.sold, tt.price * tt.sold AS revenue
           FROM ticket_types tt
           JOIN events e ON e.id = tt.event_id
           WHERE e.organizer_id = $1 AND tt.sold > 0
           ORDER BY revenue DESC LIMIT 10`,
          [org.id]
        ),
      ]);

      res.json({ success: true, data: { daily: daily.rows, by_type: byType.rows } });
    } catch (err) {
      console.error('analytics/sales:', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;
let server = null;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (signal) {
    console.log(`\n[shutdown] ${signal} received`);
  }
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await stopQueuedBackgroundJobs().catch(() => {});
    await closePool();
  } catch (err) {
    console.error('[shutdown] failed:', err.message);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });

async function start() {
  await waitForDb();

  server = app.listen(PORT, async () => {
    console.log(`\n  Sany Adventures API  http://localhost:${PORT}`);
    console.log(`  Environment      ${process.env.NODE_ENV || 'development'}`);
    console.log(`  PID              ${process.pid}`);
    console.log(`  DB               ${process.env.DB_NAME || 'via DATABASE_URL'}`);
    console.log(`  Health           http://localhost:${PORT}/health`);
    console.log(`  Ready            http://localhost:${PORT}/ready`);

    // Only run background jobs on PM2 cluster instance 0 (the leader).
    // In cluster mode NODE_APP_INSTANCE is '0','1','2'... — only 0 runs jobs.
    // In development (no PM2) NODE_APP_INSTANCE is undefined so jobs always run.
    const isClusterLeader =
      process.env.NODE_APP_INSTANCE === undefined ||
      process.env.NODE_APP_INSTANCE === '0';
    const jobsEnabled =
      process.env.ENABLE_JOBS
        ? process.env.ENABLE_JOBS === 'true'
        : process.env.NODE_ENV === 'production';

    if (isClusterLeader && jobsEnabled) {
      try {
        await startQueuedBackgroundJobs();
      } catch (e) {
        console.error('  Background jobs failed to start:', e.message);
      }
    } else if (!jobsEnabled) {
      console.log('  Background jobs  disabled (set ENABLE_JOBS=true to enable)');
    } else {
      console.log(`  Background jobs  skipped (worker ${process.env.NODE_APP_INSTANCE})`);
    }

    console.log('');
  });
}

start().catch(async (err) => {
  console.error('[startup] failed:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});

module.exports = app;
