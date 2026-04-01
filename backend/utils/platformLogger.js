const { query, queryOne } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

let ensurePlatformLogTablePromise = null;

async function tableExists(tableName) {
  const row = await queryOne(`SELECT to_regclass($1) AS regclass`, [tableName]);
  return Boolean(row?.regclass);
}

async function ensurePlatformLogTable() {
  if (!ensurePlatformLogTablePromise) {
    ensurePlatformLogTablePromise = (async () => {
      const hasUsersTable = await tableExists('users');
      const actorUserRef = hasUsersTable
        ? 'UUID REFERENCES users(id) ON DELETE SET NULL'
        : 'UUID';

      await query(`
        CREATE TABLE IF NOT EXISTS platform_activity_logs (
          id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          actor_user_id ${actorUserRef},
          actor_role    VARCHAR(30) NOT NULL DEFAULT 'system',
          domain        VARCHAR(40) NOT NULL,
          event_type    VARCHAR(80) NOT NULL,
          entity_type   VARCHAR(40) NOT NULL,
          entity_id     UUID,
          summary       VARCHAR(255) NOT NULL,
          severity      VARCHAR(20) NOT NULL DEFAULT 'info',
          ip_address    VARCHAR(80),
          user_agent    TEXT,
          payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_platform_logs_created ON platform_activity_logs(created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_platform_logs_domain ON platform_activity_logs(domain, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_platform_logs_actor ON platform_activity_logs(actor_user_id, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_platform_logs_entity ON platform_activity_logs(entity_type, entity_id, created_at DESC)`);
    })().catch((err) => {
      ensurePlatformLogTablePromise = null;
      throw err;
    });
  }

  return ensurePlatformLogTablePromise;
}

function getRequestMeta(req) {
  if (!req) return {};
  return {
    ip_address: req.ip || null,
    user_agent: req.get ? (req.get('user-agent') || null) : null,
  };
}

async function logPlatformEvent({
  actorUserId = null,
  actorRole = 'system',
  domain,
  eventType,
  entityType,
  entityId = null,
  summary,
  severity = 'info',
  payload = {},
  ipAddress = null,
  userAgent = null,
}, client = null) {
  await ensurePlatformLogTable();
  const executor = client || { query };
  await executor.query(
    `INSERT INTO platform_activity_logs
       (id, actor_user_id, actor_role, domain, event_type, entity_type, entity_id, summary, severity, ip_address, user_agent, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      uuidv4(),
      actorUserId,
      actorRole || 'system',
      domain,
      eventType,
      entityType,
      entityId,
      summary,
      severity,
      ipAddress,
      userAgent,
      JSON.stringify(payload || {}),
    ]
  );
}

module.exports = {
  ensurePlatformLogTable,
  getRequestMeta,
  logPlatformEvent,
  tableExists,
};
