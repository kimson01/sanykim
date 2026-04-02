// controllers/adminController.js
const { pool, query, queryOne } = require('../config/db');
const { clearUserCache } = require('../middleware/auth');
const { notifyNextOnWaitlist } = require('./waitlistController');
const { generateOrgSlug }      = require('./organizerProfileController');
const { v4: uuidv4 } = require('uuid');
const {
  ensurePlatformLogTable,
  tableExists: platformTableExists,
  logPlatformEvent,
  getRequestMeta,
} = require('../utils/platformLogger');

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

let ensureAdminLogTablePromise = null;

async function tableExists(tableName) {
  return platformTableExists(tableName);
}

async function ensureAdminLogTable() {
  if (!ensureAdminLogTablePromise) {
    ensureAdminLogTablePromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_activity_logs (
          id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
          actor_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
          action_type   VARCHAR(60)  NOT NULL,
          entity_type   VARCHAR(40)  NOT NULL,
          entity_id     UUID,
          summary       VARCHAR(255) NOT NULL,
          payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
          created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_activity_logs(created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_admin_logs_actor ON admin_activity_logs(actor_user_id, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_admin_logs_entity ON admin_activity_logs(entity_type, entity_id, created_at DESC)`);
    })().catch((err) => {
      ensureAdminLogTablePromise = null;
      throw err;
    });
  }

  return ensureAdminLogTablePromise;
}

const emptyJsonb = `'{}'::jsonb`;

async function logAdminActivity(actorUserId, actionType, entityType, entityId, summary, payload = {}, client = null) {
  await ensureAdminLogTable();
  const executor = client || { query };
  await executor.query(
    `INSERT INTO admin_activity_logs
       (id, actor_user_id, action_type, entity_type, entity_id, summary, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uuidv4(), actorUserId || null, actionType, entityType, entityId || null, summary, JSON.stringify(payload || {})]
  );
}

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
  try {
    const [
      events, organizers, tickets, revenue,
      recentOrders, topEvents, pendingOrgs,
      todayOrders, weekOrders, userCount,
      pendingOrgsDetail, topOrganizers,
    ] = await Promise.all([
      // Core counts
      queryOne(`SELECT COUNT(*) AS total FROM events WHERE status = 'published'`),
      queryOne(`SELECT COUNT(*) AS total FROM organizers WHERE status = 'approved'`),
      queryOne(`SELECT COUNT(*) AS total FROM tickets`),
      queryOne(`SELECT COALESCE(SUM(total),0) AS gross, COALESCE(SUM(commission_amt),0) AS platform
                FROM orders WHERE status = 'success'`),
      // Recent orders (last 8)
      query(`SELECT o.id, o.order_ref, o.attendee_name, o.attendee_email,
                    o.total, o.status, o.payment_method, o.created_at,
                    e.title AS event_title
             FROM orders o
             LEFT JOIN events e ON e.id = o.event_id
             ORDER BY o.created_at DESC LIMIT 8`),
      // Top events by revenue
      query(`SELECT e.id, e.title, e.event_date, e.total_sold, e.capacity, e.status,
                    COALESCE(SUM(tt.price * tt.sold), 0) AS revenue
             FROM events e
             LEFT JOIN ticket_types tt ON tt.event_id = e.id
             WHERE e.status = 'published'
             GROUP BY e.id ORDER BY revenue DESC LIMIT 5`),
      // Pending organizer applications
      queryOne(`SELECT COUNT(*) AS total FROM organizers WHERE status = 'pending'`),
      // Orders today
      queryOne(`SELECT COUNT(*) AS total, COALESCE(SUM(total),0) AS revenue
                FROM orders WHERE status = 'success'
                AND created_at >= CURRENT_DATE`),
      // Orders this week
      queryOne(`SELECT COUNT(*) AS total, COALESCE(SUM(total),0) AS revenue
                FROM orders WHERE status = 'success'
                AND created_at >= DATE_TRUNC('week', NOW())`),
      // Total registered users
      queryOne(`SELECT COUNT(*) AS total FROM users WHERE role = 'user'`),
      // Pending organizer details (for quick action)
      query(`SELECT o.id, u.name, u.email, o.company_name, o.business_type,
                    o.created_at, o.terms_agreed
             FROM organizers o JOIN users u ON u.id = o.user_id
             WHERE o.status = 'pending'
             ORDER BY o.created_at ASC LIMIT 5`),
      // Top organizers by revenue
      query(`SELECT u.name, o.company_name, o.total_revenue, o.commission,
                    COUNT(DISTINCT e.id) AS event_count
             FROM organizers o
             JOIN users u ON u.id = o.user_id
             LEFT JOIN events e ON e.organizer_id = o.id
             WHERE o.status = 'approved'
             GROUP BY o.id, u.name, o.company_name, o.total_revenue, o.commission
             ORDER BY o.total_revenue DESC LIMIT 5`),
    ]);

    // Daily revenue — last 14 days
    const daily = await query(
      `SELECT DATE_TRUNC('day', created_at)::date AS day,
              COALESCE(SUM(total),0) AS revenue,
              COUNT(*) AS orders
       FROM orders WHERE status = 'success'
         AND created_at >= NOW() - INTERVAL '14 days'
       GROUP BY 1 ORDER BY 1`
    );

    // Monthly revenue — last 6 months
    const monthly = await query(
      `SELECT DATE_TRUNC('month', created_at) AS month,
              COALESCE(SUM(total),0) AS revenue,
              COUNT(*) AS orders
       FROM orders WHERE status = 'success'
         AND created_at >= NOW() - INTERVAL '6 months'
       GROUP BY 1 ORDER BY 1`
    );

    // Order status breakdown
    const orderBreakdown = await query(
      `SELECT status, COUNT(*) AS total, COALESCE(SUM(total),0) AS revenue
       FROM orders GROUP BY status`
    );

    return res.json({
      success: true,
      data: {
        stats: {
          total_events:         parseInt(events.total, 10),
          total_organizers:     parseInt(organizers.total, 10),
          total_tickets_sold:   parseInt(tickets.total, 10),
          total_users:          parseInt(userCount.total, 10),
          gross_revenue:        parseFloat(revenue.gross),
          platform_revenue:     parseFloat(revenue.platform),
          pending_organizers:   parseInt(pendingOrgs.total, 10),
          today_orders:         parseInt(todayOrders.total, 10),
          today_revenue:        parseFloat(todayOrders.revenue),
          week_orders:          parseInt(weekOrders.total, 10),
          week_revenue:         parseFloat(weekOrders.revenue),
        },
        recent_orders:          recentOrders.rows,
        top_events:             topEvents.rows,
        pending_org_details:    pendingOrgsDetail.rows,
        top_organizers:         topOrganizers.rows,
        daily_revenue:          daily.rows,
        monthly_revenue:        monthly.rows,
        order_breakdown:        orderBreakdown.rows,
      },
    });
  } catch (err) {
    console.error('getDashboard:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/organizers
const getOrganizers = async (req, res) => {
  const { status } = req.query;
  const where = status ? `WHERE o.status = $1` : '';
  try {
    const orgs = await query(
      `SELECT o.*, u.name, u.email, u.phone, u.created_at AS user_created,
              COUNT(DISTINCT e.id) AS event_count
       FROM organizers o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN events e ON e.organizer_id = o.id
       ${where}
       GROUP BY o.id, u.name, u.email, u.phone, u.created_at
       ORDER BY o.created_at DESC`,
      status ? [status] : []
    );
    return res.json({ success: true, data: orgs.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/events/options
const getEventOptions = async (req, res) => {
  try {
    const events = await query(
      `SELECT e.id, e.title, e.status, e.event_date,
              e.organizer_id, o.company_name AS organizer_name
       FROM events e
       LEFT JOIN organizers o ON o.id = e.organizer_id
       ORDER BY e.event_date DESC, e.created_at DESC
       LIMIT 500`
    );
    return res.json({ success: true, data: events.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAdminLogs = async (req, res) => {
  try {
    await ensureAdminLogTable();
    await ensurePlatformLogTable();

    const [hasSupportEvents, hasSupportTickets, hasPlatformLogs] = await Promise.all([
      tableExists('support_events'),
      tableExists('support_tickets'),
      tableExists('platform_activity_logs'),
    ]);

    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(toPositiveInt(req.query.limit, 50), 100);
    const offset = (page - 1) * limit;
    const params = [];
    const where = [];

    if (req.query.source) where.push(`log_source = $${params.push(req.query.source)}`);
    if (req.query.actor_user_id) where.push(`actor_user_id = $${params.push(req.query.actor_user_id)}`);
    if (req.query.action_type) where.push(`action_type = $${params.push(req.query.action_type)}`);
    if (req.query.domain) where.push(`domain = $${params.push(req.query.domain)}`);
    if (req.query.severity) where.push(`severity = $${params.push(req.query.severity)}`);
    if (req.query.date_from) where.push(`created_at >= $${params.push(req.query.date_from)}`);
    if (req.query.date_to) where.push(`created_at < ($${params.push(req.query.date_to)}::date + INTERVAL '1 day')`);
    if (req.query.q) {
      const term = `%${String(req.query.q).trim()}%`;
      where.push(`(
        summary ILIKE $${params.push(term)} OR
        actor_name ILIKE $${params.push(term)} OR
        actor_email ILIKE $${params.push(term)} OR
        entity_type ILIKE $${params.push(term)} OR
        action_type ILIKE $${params.push(term)} OR
        domain ILIKE $${params.push(term)} OR
        severity ILIKE $${params.push(term)}
      )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const logSelects = [
      `SELECT
         'admin'::text AS log_source,
         al.id,
         al.created_at,
         al.actor_user_id,
         u.name AS actor_name,
         u.email AS actor_email,
         'admin'::text AS actor_role,
         al.action_type,
         'admin'::text AS domain,
         'info'::text AS severity,
         al.entity_type,
         al.entity_id,
         al.summary,
         jsonb_build_object(
           'domain', 'admin',
           'severity', 'info',
           'ip_address', NULL,
           'user_agent', NULL,
           'data', COALESCE(al.payload, ${emptyJsonb})
         ) AS payload
       FROM admin_activity_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id`,
    ];

    if (hasSupportEvents && hasSupportTickets) {
      logSelects.push(
        `SELECT
           'support'::text AS log_source,
           se.id,
           se.created_at,
           se.actor_user_id,
           u.name AS actor_name,
           u.email AS actor_email,
           se.actor_role,
           se.event_type AS action_type,
           'support'::text AS domain,
           CASE
             WHEN se.event_type IN ('escalated', 'ticket_deleted') THEN 'warning'::text
             ELSE 'info'::text
           END AS severity,
           'support_ticket'::text AS entity_type,
           se.ticket_id AS entity_id,
           COALESCE(st.subject, st.ticket_ref, se.event_type) AS summary,
           jsonb_build_object(
             'domain', 'support',
             'severity', CASE
               WHEN se.event_type IN ('escalated', 'ticket_deleted') THEN 'warning'
               ELSE 'info'
             END,
             'ip_address', NULL,
             'user_agent', NULL,
             'ticket_ref', st.ticket_ref,
             'ticket_status', st.status,
             'data', COALESCE(se.payload, ${emptyJsonb})
           ) AS payload
         FROM support_events se
         JOIN support_tickets st ON st.id = se.ticket_id
         LEFT JOIN users u ON u.id = se.actor_user_id
         WHERE se.actor_role = 'admin'`
      );
    }

    if (hasPlatformLogs) {
      logSelects.push(
        `SELECT
           'platform'::text AS log_source,
           pl.id,
           pl.created_at,
           pl.actor_user_id,
           u.name AS actor_name,
           u.email AS actor_email,
           pl.actor_role,
           pl.event_type AS action_type,
           pl.domain,
           pl.severity,
           pl.entity_type,
           pl.entity_id,
           pl.summary,
           jsonb_build_object(
             'domain', pl.domain,
             'severity', pl.severity,
             'ip_address', pl.ip_address,
             'user_agent', pl.user_agent,
             'data', COALESCE(pl.payload, ${emptyJsonb})
           ) AS payload
         FROM platform_activity_logs pl
         LEFT JOIN users u ON u.id = pl.actor_user_id`
      );
    }

    const baseSql = `
      WITH unified_logs AS (
        ${logSelects.join('\nUNION ALL\n')}
      )
    `;

    const [rows, countRow, sourceBreakdown, actionOptions, domainOptions, severityOptions] = await Promise.all([
      query(
        `${baseSql}
         SELECT *
         FROM unified_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne(
        `${baseSql}
         SELECT COUNT(*) AS total
         FROM unified_logs
         ${whereClause}`,
        params
      ),
      query(
        `${baseSql}
         SELECT log_source, COUNT(*)::int AS total
         FROM unified_logs
         ${whereClause}
         GROUP BY log_source
         ORDER BY log_source ASC`,
        params
      ),
      query(
        `${baseSql}
         SELECT action_type, COUNT(*)::int AS total
         FROM unified_logs
         ${whereClause}
         GROUP BY action_type
         ORDER BY total DESC, action_type ASC
         LIMIT 50`,
        params
      ),
      query(
        `${baseSql}
         SELECT domain, COUNT(*)::int AS total
         FROM unified_logs
         ${whereClause}
         GROUP BY domain
         ORDER BY total DESC, domain ASC`,
        params
      ),
      query(
        `${baseSql}
         SELECT severity, COUNT(*)::int AS total
         FROM unified_logs
         ${whereClause}
         GROUP BY severity
         ORDER BY total DESC, severity ASC`,
        params
      ),
    ]);

    const sourceTotals = sourceBreakdown.rows.reduce((acc, row) => {
      acc[row.log_source] = row.total;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: rows.rows,
      meta: {
        page,
        limit,
        total: parseInt(countRow?.total || 0, 10),
        sources: sourceTotals,
        filter_options: {
          action_types: actionOptions.rows.map((row) => ({
            value: row.action_type,
            count: row.total,
          })),
          domains: domainOptions.rows.map((row) => ({
            value: row.domain,
            count: row.total,
          })),
          severities: severityOptions.rows.map((row) => ({
            value: row.severity,
            count: row.total,
          })),
        },
      },
    });
  } catch (err) {
    console.error('getAdminLogs:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/admin/organizers/:id/status
const updateOrganizerStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ['approved', 'suspended', 'rejected', 'pending'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }
  try {
    if (status === 'approved') {
      const check = await queryOne(
        `SELECT id, terms_agreed FROM organizers WHERE id = $1`,
        [id]
      );
      if (!check) return res.status(404).json({ success: false, message: 'Organizer not found' });
      if (!check.terms_agreed) {
        return res.status(409).json({
          success: false,
          message: 'Cannot approve organizer before terms are agreed',
        });
      }
    }

    const org = await queryOne(
      `UPDATE organizers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, id]
    );
    if (!org) return res.status(404).json({ success: false, message: 'Organizer not found' });

    await logAdminActivity(
      req.user.id,
      'organizer_status_updated',
      'organizer',
      id,
      `Organizer ${org.company_name} set to ${status}`,
      { status }
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'governance',
      eventType: 'organizer_status_updated',
      entityType: 'organizer',
      entityId: id,
      summary: `Organizer ${org.company_name} set to ${status}`,
      payload: { status, company_name: org.company_name },
      ...getRequestMeta(req),
    }).catch(() => {});

    // Generate a public URL slug when the organizer is approved for the first time
    if (status === 'approved' && !org.slug) {
      setImmediate(() =>
        generateOrgSlug(org.id, org.company_name)
          .catch(e => console.error('[approve] slug error:', e.message))
      );
    }

    return res.json({ success: true, message: `Organizer ${status}`, data: org });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/admin/organizers/:id/commission
const setCommission = async (req, res) => {
  const { id } = req.params;
  const { commission } = req.body;
  if (commission === undefined || commission < 0 || commission > 100) {
    return res.status(400).json({ success: false, message: 'Commission must be 0–100' });
  }
  try {
    await queryOne(`UPDATE organizers SET commission = $1, updated_at = NOW() WHERE id = $2`, [commission, id]);
    await logAdminActivity(
      req.user.id,
      'organizer_commission_updated',
      'organizer',
      id,
      `Organizer commission changed to ${commission}%`,
      { commission }
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'governance',
      eventType: 'organizer_commission_updated',
      entityType: 'organizer',
      entityId: id,
      summary: `Organizer commission changed to ${commission}%`,
      payload: { commission },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Commission updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/users
const getUsers = async (req, res) => {
  try {
    const users = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
              COUNT(DISTINCT o.id) AS order_count,
              COALESCE(SUM(o.total), 0) AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'success'
       GROUP BY u.id ORDER BY u.created_at DESC`
    );
    return res.json({ success: true, data: users.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/transactions
const getTransactions = async (req, res) => {
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 50), 100);
  const offset = (page - 1) * limit;
  const params = [];
  const where = [];

  if (req.query.status) where.push(`t.status = $${params.push(req.query.status)}`);
  if (req.query.method) where.push(`t.method = $${params.push(req.query.method)}`);
  if (req.query.organizer_id) where.push(`e.organizer_id = $${params.push(req.query.organizer_id)}`);
  if (req.query.event_id) where.push(`e.id = $${params.push(req.query.event_id)}`);
  if (req.query.date_from) where.push(`t.created_at >= $${params.push(req.query.date_from)}`);
  if (req.query.date_to) where.push(`t.created_at < ($${params.push(req.query.date_to)}::date + INTERVAL '1 day')`);
  if (req.query.q) {
    const term = `%${String(req.query.q).trim()}%`;
    where.push(`(
      t.txn_ref ILIKE $${params.push(term)} OR
      o.order_ref ILIKE $${params.push(term)} OR
      o.attendee_name ILIKE $${params.push(term)} OR
      o.attendee_email ILIKE $${params.push(term)} OR
      e.title ILIKE $${params.push(term)} OR
      org.company_name ILIKE $${params.push(term)}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const [rows, countRow, summaryRow, reconRow] = await Promise.all([
      query(
        `SELECT t.*,
                o.id AS order_id,
                o.order_ref,
                o.status AS order_status,
                o.attendee_name,
                o.attendee_email,
                o.total AS order_total,
                o.commission_amt,
                e.id AS event_id,
                e.title AS event_title,
                e.organizer_id,
                org.company_name AS organizer_name
         FROM transactions t
         JOIN orders o ON o.id = t.order_id
         JOIN events e ON e.id = o.event_id
         LEFT JOIN organizers org ON org.id = e.organizer_id
         ${whereClause}
         ORDER BY t.created_at DESC, t.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne(
        `SELECT COUNT(*) AS total
         FROM transactions t
         JOIN orders o ON o.id = t.order_id
         JOIN events e ON e.id = o.event_id
         LEFT JOIN organizers org ON org.id = e.organizer_id
         ${whereClause}`,
        params
      ),
      queryOne(
        `SELECT
           COUNT(*)::int AS total_transactions,
           COUNT(*) FILTER (WHERE t.status = 'success')::int AS successful_transactions,
           COUNT(*) FILTER (WHERE t.status = 'refunded')::int AS refunded_transactions,
           COUNT(*) FILTER (WHERE t.status = 'pending')::int AS pending_transactions,
           COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'success'), 0) AS successful_amount,
           COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'refunded'), 0) AS refunded_amount
         FROM transactions t
         JOIN orders o ON o.id = t.order_id
         JOIN events e ON e.id = o.event_id
         LEFT JOIN organizers org ON org.id = e.organizer_id
         ${whereClause}`,
        params
      ),
      queryOne(
        `SELECT
           COALESCE((SELECT SUM(total) FROM orders WHERE status = 'success'), 0) AS orders_success_total,
           COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'success'), 0) AS tx_success_total,
           COALESCE((SELECT SUM(ABS(gross_amount)) FROM revenue_ledger WHERE type = 'sale'), 0) AS ledger_sales_total,
           COALESCE((SELECT SUM(available_balance) FROM organizers), 0) AS organizer_available_total,
           COALESCE((SELECT SUM(total_paid_out) FROM organizers), 0) AS organizer_paid_out_total,
           COALESCE((SELECT SUM(amount) FROM payouts WHERE status = 'completed'), 0) AS payouts_completed_total`
      ),
    ]);

    return res.json({
      success: true,
      data: rows.rows,
      meta: {
        page,
        limit,
        total: parseInt(countRow?.total || 0, 10),
      },
      summary: {
        total_transactions: parseInt(summaryRow?.total_transactions || 0, 10),
        successful_transactions: parseInt(summaryRow?.successful_transactions || 0, 10),
        refunded_transactions: parseInt(summaryRow?.refunded_transactions || 0, 10),
        pending_transactions: parseInt(summaryRow?.pending_transactions || 0, 10),
        successful_amount: parseFloat(summaryRow?.successful_amount || 0),
        refunded_amount: parseFloat(summaryRow?.refunded_amount || 0),
      },
      reconciliation: {
        orders_success_total: parseFloat(reconRow?.orders_success_total || 0),
        tx_success_total: parseFloat(reconRow?.tx_success_total || 0),
        ledger_sales_total: parseFloat(reconRow?.ledger_sales_total || 0),
        organizer_available_total: parseFloat(reconRow?.organizer_available_total || 0),
        organizer_paid_out_total: parseFloat(reconRow?.organizer_paid_out_total || 0),
        payouts_completed_total: parseFloat(reconRow?.payouts_completed_total || 0),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET/PUT /api/admin/settings
const getSettings = async (req, res) => {
  try {
    const settings = await query(`SELECT key, value FROM platform_settings`);
    const obj = {};
    settings.rows.forEach(r => { obj[r.key] = r.value; });
    return res.json({ success: true, data: obj });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const ALLOWED_SETTINGS = new Set([
  'commission_rate',
  'platform_name',
  'support_email',
  'currency',
  'terms_and_conditions',
  'security_enforce_email_verification',
  'security_require_organizer_kyc',
  'security_fraud_auto_block',
  'security_max_orders_per_hour_per_ip',
  'trust_show_buyer_protection',
  'trust_show_trust_badges',
  'trust_buyer_protection_text',
  'cms_home_eyebrow',
  'cms_home_title',
  'cms_home_title_highlight',
  'cms_home_subtitle',
  'cms_home_primary_cta_label',
  'cms_home_primary_cta_url',
  'cms_home_secondary_cta_label',
  'cms_home_secondary_cta_url',
  'cms_footer_tagline',
]);

const BOOLEAN_SETTINGS = new Set([
  'security_enforce_email_verification',
  'security_require_organizer_kyc',
  'security_fraud_auto_block',
  'trust_show_buyer_protection',
  'trust_show_trust_badges',
]);

const normalizeSettingValue = (key, value) => {
  if (BOOLEAN_SETTINGS.has(key)) {
    return String(value === true || value === 'true');
  }
  return String(value ?? '');
};

const updateSettings = async (req, res) => {
  const updates = req.body; // { commission_rate: '12', platform_name: '...' }
  try {
    for (const [key, value] of Object.entries(updates || {})) {
      if (!ALLOWED_SETTINGS.has(key)) continue;
      await query(
        `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, normalizeSettingValue(key, value)]
      );
    }
    await logAdminActivity(
      req.user.id,
      'platform_settings_updated',
      'platform_settings',
      null,
      'Platform settings updated',
      { keys: Object.keys(updates || {}).filter((key) => ALLOWED_SETTINGS.has(key)) }
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'governance',
      eventType: 'platform_settings_updated',
      entityType: 'platform_settings',
      summary: 'Platform settings updated',
      payload: { keys: Object.keys(updates || {}).filter((key) => ALLOWED_SETTINGS.has(key)) },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PATCH /api/admin/users/:id/toggle ────────────────────────
const toggleUserActive = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await queryOne(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND role != 'admin'
       RETURNING id, name, email, role, is_active`,
      [id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found or cannot modify admin' });
    const action = user.is_active ? 'enabled' : 'disabled';
    // Invalidate the auth cache so the change takes effect immediately
    clearUserCache(id);
    await logAdminActivity(
      req.user.id,
      'user_status_toggled',
      'user',
      id,
      `User ${user.email} ${action}`,
      { is_active: user.is_active, role: user.role }
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'governance',
      eventType: 'user_status_toggled',
      entityType: 'user',
      entityId: id,
      summary: `User ${user.email} ${action}`,
      payload: { is_active: user.is_active, role: user.role },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: `User ${action}`, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ── PATCH /api/admin/organizers/:id/notes ────────────────────
// Admin saves internal notes and/or rejection reason
const updateOrganizerNotes = async (req, res) => {
  const { id } = req.params;
  const { admin_notes, rejection_reason } = req.body;
  try {
    const org = await queryOne(
      `UPDATE organizers
       SET admin_notes      = COALESCE($1, admin_notes),
           rejection_reason = COALESCE($2, rejection_reason),
           updated_at       = NOW()
       WHERE id = $3
       RETURNING id`,
      [admin_notes || null, rejection_reason || null, id]
    );
    if (!org) return res.status(404).json({ success: false, message: 'Organizer not found' });
    await logAdminActivity(
      req.user.id,
      'organizer_notes_updated',
      'organizer',
      id,
      'Organizer notes updated',
      {
        has_admin_notes: admin_notes !== undefined,
        has_rejection_reason: rejection_reason !== undefined,
      }
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'governance',
      eventType: 'organizer_notes_updated',
      entityType: 'organizer',
      entityId: id,
      summary: 'Organizer notes updated',
      payload: {
        has_admin_notes: admin_notes !== undefined,
        has_rejection_reason: rejection_reason !== undefined,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Notes saved' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ── GET /api/admin/organizers/:id/ledger ─────────────────────
// Full transaction history for one organizer
const getOrgLedger = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  try {
    const [rows, totals] = await Promise.all([
      query(
        `SELECT rl.*,
                o.order_ref, o.attendee_name, o.attendee_email,
                e.title AS event_title,
                u.name  AS created_by_name
         FROM revenue_ledger rl
         LEFT JOIN orders o    ON o.id  = rl.order_id
         LEFT JOIN events e    ON e.id  = o.event_id
         LEFT JOIN users  u    ON u.id  = rl.created_by
         WHERE rl.organizer_id = $1
         ORDER BY rl.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, parseInt(limit, 10), offset]
      ),
      queryOne(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'sale'   THEN gross_amount  ELSE 0 END), 0) AS total_gross,
           COALESCE(SUM(CASE WHEN type = 'sale'   THEN commission_amt ELSE 0 END), 0) AS total_commission,
           COALESCE(SUM(CASE WHEN type = 'sale'   THEN net_amount    ELSE 0 END), 0) AS total_earned,
           COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(net_amount) ELSE 0 END), 0) AS total_refunded,
           COALESCE(SUM(CASE WHEN type = 'payout' THEN ABS(net_amount) ELSE 0 END), 0) AS total_paid_out,
           COUNT(*) AS entry_count
         FROM revenue_ledger WHERE organizer_id = $1`,
        [id]
      ),
    ]);
    // Current balance from organizer row (source of truth)
    const org = await queryOne(
      `SELECT available_balance, total_revenue, total_paid_out FROM organizers WHERE id = $1`, [id]
    );
    return res.json({
      success: true,
      data: { entries: rows.rows, totals, organizer: org },
    });
  } catch (err) {
    console.error('getOrgLedger:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/admin/organizers/:id/payout ────────────────────
// Admin records a disbursement — marks amount as paid out to organizer
const recordPayout = async (req, res) => {
  const { id } = req.params;
  const { amount, method = 'mpesa', reference, note } = req.body;
  const allowedMethods = new Set(['mpesa', 'bank', 'cash']);

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
  }
  if (!allowedMethods.has(method)) {
    return res.status(400).json({ success: false, message: 'Invalid payout method' });
  }

  try {
    // Check organizer has enough available balance
    const org = await queryOne(
      `SELECT id, company_name, available_balance FROM organizers WHERE id = $1`, [id]
    );
    if (!org) return res.status(404).json({ success: false, message: 'Organizer not found' });

    const payoutAmt = parseFloat(amount);
    if (payoutAmt > parseFloat(org.available_balance)) {
      return res.status(400).json({
        success: false,
        message: `Payout amount (${payoutAmt}) exceeds available balance (${org.available_balance})`,
      });
    }

    const payoutId   = uuidv4();
    const newBalance = parseFloat(org.available_balance) - payoutAmt;

    // Use a transaction for atomicity
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Create payout record
      await dbClient.query(
        `INSERT INTO payouts
           (id, organizer_id, amount, method, reference, status, note, processed_by, processed_at)
         VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,NOW())`,
        [payoutId, id, payoutAmt, method, reference || null, note || null, req.user.id]
      );

      // Deduct from available balance, add to total_paid_out
      await dbClient.query(
        `UPDATE organizers
         SET available_balance = available_balance - $1,
             total_paid_out    = total_paid_out    + $1,
             updated_at        = NOW()
         WHERE id = $2`,
        [payoutAmt, id]
      );

      // Write ledger entry
      await dbClient.query(
        `INSERT INTO revenue_ledger
           (id, organizer_id, order_id, type,
            gross_amount, commission_amt, net_amount, running_balance,
            description, created_by)
         VALUES ($1,$2,NULL,'payout',$3,0,$4,$5,$6,$7)`,
        [
          uuidv4(), id,
          -payoutAmt,
          -payoutAmt,
          newBalance,
          `Payout via ${method}${reference ? ' — ref: ' + reference : ''}${note ? ' — ' + note : ''}`,
          req.user.id,
        ]
      );

      await logAdminActivity(
        req.user.id,
        'payout_recorded',
        'payout',
        payoutId,
        `Payout recorded for ${org.company_name}`,
        { organizer_id: id, amount: payoutAmt, method, reference: reference || null },
        dbClient
      );
      await logPlatformEvent({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        domain: 'finance',
        eventType: 'organizer_payout_recorded',
        entityType: 'payout',
        entityId: payoutId,
        summary: `Payout recorded for ${org.company_name}`,
        payload: {
          organizer_id: id,
          company_name: org.company_name,
          amount: payoutAmt,
          method,
          reference: reference || null,
          new_balance: newBalance,
        },
        ...getRequestMeta(req),
      }, dbClient);

      await dbClient.query('COMMIT');
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      dbClient.release();
    }

    return res.json({
      success: true,
      message: `Payout of KES ${payoutAmt.toLocaleString()} recorded for ${org.company_name}`,
      data: {
        payout_id:        payoutId,
        amount:           payoutAmt,
        new_balance:      newBalance,
        method,
        reference,
        status:           'completed',
      },
    });
  } catch (err) {
    console.error('recordPayout:', err.message);
    return res.status(err.message.includes('exceeds') ? 400 : 500)
              .json({ success: false, message: err.message });
  }
};

// ── GET /api/admin/payouts ────────────────────────────────────
// All payout history across all organizers
const getAllPayouts = async (req, res) => {
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 50), 100);
  const offset = (page - 1) * limit;
  const params = [];
  const where = [];

  if (req.query.status) where.push(`p.status = $${params.push(req.query.status)}`);
  if (req.query.method) where.push(`p.method = $${params.push(req.query.method)}`);
  if (req.query.organizer_id) where.push(`p.organizer_id = $${params.push(req.query.organizer_id)}`);
  if (req.query.date_from) where.push(`p.created_at >= $${params.push(req.query.date_from)}`);
  if (req.query.date_to) where.push(`p.created_at < ($${params.push(req.query.date_to)}::date + INTERVAL '1 day')`);
  if (req.query.q) {
    const term = `%${String(req.query.q).trim()}%`;
    where.push(`(
      o.company_name ILIKE $${params.push(term)} OR
      p.reference ILIKE $${params.push(term)} OR
      p.note ILIKE $${params.push(term)}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const [rows, countRow, summaryRow] = await Promise.all([
      query(
        `SELECT p.*,
                o.company_name,
                o.available_balance,
                o.total_paid_out,
                u.name AS processed_by_name
         FROM payouts p
         JOIN organizers o ON o.id = p.organizer_id
         LEFT JOIN users u ON u.id = p.processed_by
         ${whereClause}
         ORDER BY p.created_at DESC, p.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne(
        `SELECT COUNT(*) AS total
         FROM payouts p
         JOIN organizers o ON o.id = p.organizer_id
         ${whereClause}`,
        params
      ),
      queryOne(
        `SELECT
           COUNT(*)::int AS total_payouts,
           COUNT(*) FILTER (WHERE p.status = 'completed')::int AS completed_payouts,
           COUNT(*) FILTER (WHERE p.status = 'pending')::int AS pending_payouts,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) AS completed_amount,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending'), 0) AS pending_amount
         FROM payouts p
         JOIN organizers o ON o.id = p.organizer_id
         ${whereClause}`,
        params
      ),
    ]);
    return res.json({
      success: true,
      data: rows.rows,
      meta: {
        page,
        limit,
        total: parseInt(countRow?.total || 0, 10),
      },
      summary: {
        total_payouts: parseInt(summaryRow?.total_payouts || 0, 10),
        completed_payouts: parseInt(summaryRow?.completed_payouts || 0, 10),
        pending_payouts: parseInt(summaryRow?.pending_payouts || 0, 10),
        completed_amount: parseFloat(summaryRow?.completed_amount || 0),
        pending_amount: parseFloat(summaryRow?.pending_amount || 0),
      },
    });
  } catch (err) {
    console.error('getAllPayouts:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/admin/orders/:id/refund ────────────────────────
const refundOrder = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the order row — include commission_amt for correct reversal
    const orderRes = await client.query(
      `SELECT o.*, e.organizer_id
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.id = $1
       FOR UPDATE`,
      [id]
    );
    const order = orderRes.rows[0];
    if (!order) throw new Error('Order not found');
    if (order.status !== 'success') {
      throw new Error(`Cannot refund an order with status "${order.status}"`);
    }

    // The organizer earned the NET amount (gross minus commission).
    // The platform earned commission_amt.
    // On refund: organizer loses their net, platform loses its commission.
    const netToOrg     = Number(order.total) - Number(order.commission_amt);

    // Idempotency / duplicate refund protection
    const existingRefund = await client.query(
      `SELECT id
       FROM transactions
       WHERE order_id = $1
         AND status = 'refunded'
       LIMIT 1`,
      [id]
    );
    if (existingRefund.rows[0]) {
      throw new Error('Order already refunded');
    }

    // ── 1. Mark order refunded ────────────────────────────
    await client.query(
      `UPDATE orders
       SET status = 'refunded',
           notes  = COALESCE(notes,'') || $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reason ? `\nRefund reason: ${reason}` : '\nRefunded by admin', id]
    );

    // ── 2. Invalidate tickets without polluting scan state ─
    await client.query(
      `UPDATE tickets
       SET is_voided = TRUE,
           voided_at = NOW(),
           void_reason = $2
       WHERE order_id = $1
         AND is_voided = FALSE`,
      [id, reason || 'Refunded by admin']
    );
    await client.query(
      `UPDATE attendees
       SET checked_in = FALSE,
           checked_in_at = NULL
       WHERE order_id = $1`,
      [id]
    );

    // ── 3. Reverse ticket type sold counts ────────────────
    const items = await client.query(
      `SELECT ticket_type_id, quantity FROM order_items WHERE order_id = $1`, [id]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE ticket_types SET sold = GREATEST(0, sold - $1) WHERE id = $2`,
        [item.quantity, item.ticket_type_id]
      );
    }

    // ── 4. Reverse event total_sold ───────────────────────
    const qtyRes = await client.query(
      `SELECT COALESCE(SUM(quantity),0) AS total FROM order_items WHERE order_id = $1`, [id]
    );
    await client.query(
      `UPDATE events
       SET total_sold = GREATEST(0, total_sold - $1)
       WHERE id = $2`,
      [parseInt(qtyRes.rows[0].total, 10), order.event_id]
    );

    // ── 5. Reverse organizer balance (NET only, not gross) ─
    // Organizer gets debited only their net share.
    // The platform commission is handled separately — the platform
    // also loses that money on a refund (it must be returned to the buyer).
    const orgBalRes = await client.query(
      `UPDATE organizers
       SET total_revenue     = GREATEST(0, total_revenue     - $1),
           available_balance = GREATEST(0, available_balance - $2),
           updated_at        = NOW()
       WHERE id = $3
       RETURNING id, available_balance`,
      [order.total, netToOrg, order.organizer_id]
    );
    const newBalance = orgBalRes.rows[0]?.available_balance || 0;

    // ── 6. Write ledger entry — refund ────────────────────
    await client.query(
      `INSERT INTO revenue_ledger
         (id, organizer_id, order_id, type,
          gross_amount, commission_amt, net_amount, running_balance,
          description, created_by)
       VALUES ($1,$2,$3,'refund',$4,$5,$6,$7,$8,$9)`,
      [
        uuidv4(), order.organizer_id, id,
        -Number(order.total),
        -Number(order.commission_amt),
        -netToOrg,
        newBalance,
        `Refund — Order ${order.order_ref}${reason ? ': ' + reason : ''}`,
        req.user.id,
      ]
    );

    // ── 7. Transaction audit record ───────────────────────
    await client.query(
      `INSERT INTO transactions
         (id, order_id, txn_ref, amount, method, status, provider_data)
       VALUES ($1,$2,$3,$4,$5,'refunded',$6)`,
      [
        uuidv4(), id,
        'REFUND-' + id.slice(0, 8).toUpperCase(),
        order.total, order.payment_method || 'mpesa',
        JSON.stringify({ refunded_by: req.user.id, reason: reason || null }),
      ]
    );

    await logAdminActivity(
      req.user.id,
      'order_refunded',
      'order',
      id,
      `Order ${order.order_ref} refunded`,
      {
        reason: reason || null,
        refund_amount: Number(order.total),
        organizer_id: order.organizer_id,
      },
      client
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'finance',
      eventType: 'order_refunded',
      entityType: 'order',
      entityId: id,
      summary: `Order ${order.order_ref} refunded`,
      payload: {
        order_ref: order.order_ref,
        refund_amount: Number(order.total),
        commission_amount: Number(order.commission_amt),
        organizer_id: order.organizer_id,
        reason: reason || null,
      },
      ...getRequestMeta(req),
    }, client);

    await client.query('COMMIT');

    // ── 8. Notify next person on waitlist (non-blocking) ──
    // A refund freed up a ticket — the next person waiting gets an email.
    setImmediate(() => notifyNextOnWaitlist(order.event_id));

    // ── 9. Notify attendee by email (non-blocking) ────────
    setImmediate(async () => {
      try {
        const { sendRefundEmail } = require('../utils/mailer');
        if (sendRefundEmail) {
          await sendRefundEmail({
            to:          order.attendee_email,
            attendeeName: order.attendee_name,
            orderRef:    order.order_ref,
            amount:      order.total,
            reason:      reason || 'Refunded by administrator',
          });
        }
      } catch (e) {
        console.error('[refundOrder] email error:', e.message);
      }
    });

    return res.json({
      success: true,
      message: 'Order refunded successfully',
      data: {
        order_id: id,
        order_ref:    order.order_ref,
        refund_amount: order.total,
        organizer_deducted: netToOrg,
        platform_deducted:  Number(order.commission_amt),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('refundOrder:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

module.exports = {
  getDashboard, getOrganizers, updateOrganizerStatus, setCommission,
  getEventOptions, getAdminLogs,
  getUsers, getTransactions, getSettings, updateSettings,
  refundOrder, toggleUserActive, updateOrganizerNotes,
  getOrgLedger, recordPayout, getAllPayouts,
};
