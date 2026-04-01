const { v4: uuidv4 } = require('uuid');
const { pool, query, queryOne } = require('../config/db');
const {
  getActorScope,
  canViewTicket,
  canReplyToTicket,
  canSoftDeleteTicket,
} = require('./supportAccessService');

const ORDER_ROUTED_CATEGORIES = new Set(['tickets', 'payments', 'refunds']);
const INTERNAL_STATUSES = new Set(['new', 'in_review', 'waiting_organizer', 'escalated', 'resolved', 'closed']);
const PUBLIC_STATUSES = new Set(['open', 'pending', 'resolved', 'closed']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const CATEGORIES = new Set(['payments', 'tickets', 'refunds', 'organizer', 'account', 'technical', 'other']);
const ORGANIZER_ALLOWED_STATUSES = new Set(['resolved', 'escalated']);

const mkRef = () => `SUP-${uuidv4().slice(0, 8).toUpperCase()}`;

function readColumnForRole(role) {
  if (role === 'user') return 'user_last_read_at';
  if (role === 'organizer') return 'organizer_last_read_at';
  if (role === 'admin') return 'admin_last_read_at';
  return null;
}

function unreadCountSql(scope) {
  const readColumn = readColumnForRole(scope?.role);
  if (!readColumn || !scope?.role) return '0::integer';
  return `(
    SELECT COUNT(*)
    FROM support_messages smu
    WHERE smu.ticket_id = st.id
      AND smu.deleted_at IS NULL
      AND smu.is_internal = FALSE
      AND smu.author_role <> '${scope.role}'
      AND smu.created_at > COALESCE(st.${readColumn}, TIMESTAMPTZ 'epoch')
  )`;
}

function normalizePriority(priority) {
  if (!priority) return null;
  if (priority === 'critical') return 'urgent';
  return priority;
}

function derivePriority(category, explicitPriority) {
  const normalized = normalizePriority(explicitPriority);
  if (normalized && PRIORITIES.has(normalized)) return normalized;
  if (category === 'refunds' || category === 'payments') return 'high';
  return 'medium';
}

function expandStatusFilter(status) {
  if (!status) return null;
  if (INTERNAL_STATUSES.has(status)) return [status];
  if (!PUBLIC_STATUSES.has(status)) return null;
  if (status === 'open') return ['new', 'in_review'];
  if (status === 'pending') return ['waiting_organizer', 'escalated'];
  return [status];
}

function statusGroup(status) {
  if (['new', 'in_review'].includes(status)) return 'open';
  if (['waiting_organizer', 'escalated'].includes(status)) return 'pending';
  return status;
}

function assertOrganizerStatusUpdateAllowed(currentStatus, nextStatus) {
  if (!ORGANIZER_ALLOWED_STATUSES.has(nextStatus)) {
    const err = new Error('Organizers can only mark tickets resolved or escalate them');
    err.statusCode = 403;
    throw err;
  }

  if (['resolved', 'closed'].includes(currentStatus)) {
    const err = new Error('Closed tickets cannot be changed by organizers');
    err.statusCode = 400;
    throw err;
  }
}

async function resolveUserIdByEmail(email) {
  const row = await queryOne(`SELECT id FROM users WHERE email = $1`, [String(email).toLowerCase().trim()]);
  return row?.id || null;
}

async function resolveOrderContext(orderRef) {
  if (!orderRef) return { order_id: null, event_id: null, organizer_id: null };
  const row = await queryOne(
    `SELECT o.id AS order_id, o.event_id, e.organizer_id
     FROM orders o
     LEFT JOIN events e ON e.id = o.event_id
     WHERE o.order_ref = $1`,
    [orderRef]
  );
  return row || { order_id: null, event_id: null, organizer_id: null };
}

async function getPrimarySuperAdminId() {
  const row = await queryOne(
    `SELECT id
     FROM users
     WHERE role = 'admin' AND is_active = TRUE
     ORDER BY created_at ASC
     LIMIT 1`
  );
  return row?.id || null;
}

function buildTicketSelectSql(scope) {
  return `
  WITH message_stats AS (
    SELECT sm.ticket_id,
           COUNT(*) FILTER (WHERE sm.deleted_at IS NULL AND sm.is_internal = FALSE) AS public_message_count,
           MAX(sm.created_at) FILTER (WHERE sm.deleted_at IS NULL) AS latest_message_at
    FROM support_messages sm
    GROUP BY sm.ticket_id
  ),
  last_public_message AS (
    SELECT DISTINCT ON (sm.ticket_id)
           sm.ticket_id,
           sm.body
    FROM support_messages sm
    WHERE sm.deleted_at IS NULL
      AND sm.is_internal = FALSE
    ORDER BY sm.ticket_id, sm.created_at DESC
  )
  SELECT st.*,
         u.name AS user_name,
         u.email AS user_email,
         o.company_name AS organizer_name,
         ev.title AS event_title,
         ord.order_ref,
         au.name AS assigned_admin_name,
         COALESCE(ms.public_message_count, 0) AS message_count,
         ${unreadCountSql(scope)} AS unread_count,
         COALESCE(ms.latest_message_at, st.last_message_at, st.updated_at, st.created_at) AS last_message_at_effective,
         lpm.body AS last_message_preview,
         (
           st.created_at + CASE
             WHEN st.priority = 'urgent' THEN INTERVAL '2 hours'
             WHEN st.priority = 'high'   THEN INTERVAL '6 hours'
             WHEN st.priority = 'medium' THEN INTERVAL '24 hours'
             ELSE INTERVAL '48 hours'
           END
         ) AS sla_due_at,
         CASE
           WHEN st.status IN ('resolved', 'closed') THEN 'resolved'
           WHEN (
             st.created_at + CASE
               WHEN st.priority = 'urgent' THEN INTERVAL '2 hours'
               WHEN st.priority = 'high'   THEN INTERVAL '6 hours'
               WHEN st.priority = 'medium' THEN INTERVAL '24 hours'
               ELSE INTERVAL '48 hours'
             END
           ) < NOW() THEN 'overdue'
           WHEN (
             st.created_at + CASE
               WHEN st.priority = 'urgent' THEN INTERVAL '2 hours'
               WHEN st.priority = 'high'   THEN INTERVAL '6 hours'
               WHEN st.priority = 'medium' THEN INTERVAL '24 hours'
               ELSE INTERVAL '48 hours'
             END
           ) < NOW() + INTERVAL '2 hours' THEN 'due_soon'
           ELSE 'on_track'
         END AS sla_state,
         CASE
           WHEN st.organizer_id IS NOT NULL AND st.status = 'waiting_organizer' THEN 'organizer'
           ELSE 'super_admin'
         END AS owner_lane
  FROM support_tickets st
  LEFT JOIN users u ON u.id = st.user_id
  LEFT JOIN organizers o ON o.id = st.organizer_id
  LEFT JOIN events ev ON ev.id = st.event_id
  LEFT JOIN orders ord ON ord.id = st.order_id
  LEFT JOIN users au ON au.id = st.assigned_admin_id
  LEFT JOIN message_stats ms ON ms.ticket_id = st.id
  LEFT JOIN last_public_message lpm ON lpm.ticket_id = st.id
`;
}

function buildAdminTicketViewSql() {
  return `
    WITH ticket_view AS (
      ${buildTicketSelectSql({ role: 'admin' })}
      WHERE st.deleted_at IS NULL
    )
  `;
}

async function logEvent(client, ticketId, actorUserId, actorRole, eventType, payload = {}) {
  await client.query(
    `INSERT INTO support_events (id, ticket_id, actor_user_id, actor_role, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [uuidv4(), ticketId, actorUserId || null, actorRole || 'system', eventType, JSON.stringify(payload)]
  );
}

async function getTicketById(ticketId, scope = null) {
  const row = await queryOne(
    `${buildTicketSelectSql(scope)}
     WHERE st.id = $1
       AND st.deleted_at IS NULL`,
    [ticketId]
  );
  return row ? { ...row, status_group: statusGroup(row.status) } : null;
}

async function assertTicketAccess(actor, ticketId, predicate = canViewTicket) {
  const scope = await getActorScope(actor);
  const ticket = await getTicketById(ticketId, scope);
  if (!ticket) {
    const err = new Error('Ticket not found');
    err.statusCode = 404;
    throw err;
  }
  if (!predicate(scope, ticket)) {
    const err = new Error('Not authorized for this ticket');
    err.statusCode = 403;
    throw err;
  }
  return { scope, ticket };
}

async function getTicketForActor(actor, ticketId) {
  const { ticket } = await assertTicketAccess(actor, ticketId, canViewTicket);
  return ticket;
}

async function createTicket(actor, payload) {
  const category = String(payload.category || '').toLowerCase();
  if (!CATEGORIES.has(category)) {
    const err = new Error('Invalid support category');
    err.statusCode = 422;
    throw err;
  }

  const supportEmailRow = await queryOne(`SELECT value FROM platform_settings WHERE key = 'support_email'`);
  const supportEmail = supportEmailRow?.value || process.env.SUPPORT_EMAIL || 'support@sanyadventures.com';
  const userId = actor?.id || await resolveUserIdByEmail(payload.email);
  const orderContext = await resolveOrderContext(payload.order_ref);
  const adminId = await getPrimarySuperAdminId();
  const routedToOrganizer = Boolean(orderContext.organizer_id && ORDER_ROUTED_CATEGORIES.has(category));
  const initialStatus = routedToOrganizer ? 'waiting_organizer' : 'in_review';
  const priority = derivePriority(category, payload.priority);
  const ticketId = uuidv4();
  const ticketRef = mkRef();
  const actorScope = await getActorScope(actor);
  const userLastReadAt = actorScope.role === 'user' ? 'NOW()' : 'NULL';
  const organizerLastReadAt = actorScope.role === 'organizer' ? 'NOW()' : 'NULL';
  const adminLastReadAt = actorScope.role === 'admin' ? 'NOW()' : 'NULL';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO support_tickets
         (id, ticket_ref, user_id, organizer_id, order_id, event_id, category, subject, message,
          status, priority, created_by_role, created_by_user_id, assigned_admin_id, source, channel, last_message_at,
          user_last_read_at, organizer_last_read_at, admin_last_read_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(), ${userLastReadAt}, ${organizerLastReadAt}, ${adminLastReadAt})`,
      [
        ticketId,
        ticketRef,
        userId,
        routedToOrganizer ? orderContext.organizer_id : null,
        orderContext.order_id || null,
        orderContext.event_id || null,
        category,
        payload.subject,
        payload.message,
        initialStatus,
        priority,
        actor?.role || 'guest',
        actor?.id || userId,
        adminId,
        payload.source || 'web',
        payload.channel || 'dashboard',
      ]
    );
    await client.query(
      `INSERT INTO support_messages (id, ticket_id, author_user_id, author_role, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), ticketId, actor?.id || userId, actor?.role || 'guest', payload.message]
    );
    await logEvent(client, ticketId, actor?.id || userId, actor?.role || 'guest', 'ticket_created', {
      status: initialStatus,
      priority,
      routed_to_organizer: routedToOrganizer,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    ticket: await getTicketById(ticketId, actorScope),
    request_id: ticketRef,
    support_email: supportEmail,
  };
}

function buildListQuery(scope, filters) {
  const params = [];
  const where = ['st.deleted_at IS NULL'];

  if (scope.role === 'user') {
    where.push(`st.user_id = $${params.push(scope.userId)}`);
  } else if (scope.role === 'organizer') {
    if (!scope.organizerId) {
      const err = new Error('Organizer not found');
      err.statusCode = 404;
      throw err;
    }
    where.push(`st.organizer_id = $${params.push(scope.organizerId)}`);
  }

  const statuses = expandStatusFilter(filters.status);
  if (filters.status && !statuses) {
    const err = new Error('Invalid support status');
    err.statusCode = 422;
    throw err;
  }
  if (statuses?.length === 1) {
    where.push(`st.status = $${params.push(statuses[0])}`);
  } else if (statuses?.length > 1) {
    const placeholders = statuses.map((status) => `$${params.push(status)}`).join(', ');
    where.push(`st.status IN (${placeholders})`);
  }

  const priority = normalizePriority(filters.priority);
  if (priority) {
    if (!PRIORITIES.has(priority)) {
      const err = new Error('Invalid support priority');
      err.statusCode = 422;
      throw err;
    }
    where.push(`st.priority = $${params.push(priority)}`);
  }
  if (filters.category) where.push(`st.category = $${params.push(filters.category)}`);
  if (filters.escalated_only === true || String(filters.escalated_only).toLowerCase() === 'true') {
    where.push(`st.escalation_level > 0`);
  }
  if (filters.from) where.push(`st.created_at >= $${params.push(filters.from)}`);
  if (filters.to) where.push(`st.created_at < ($${params.push(filters.to)}::date + INTERVAL '1 day')`);
  if (filters.q) {
    const term = `%${String(filters.q).trim()}%`;
    where.push(`(
      st.ticket_ref ILIKE $${params.push(term)} OR
      st.subject ILIKE $${params.push(term)} OR
      st.message ILIKE $${params.push(term)} OR
      u.email ILIKE $${params.push(term)} OR
      o.company_name ILIKE $${params.push(term)} OR
      ev.title ILIKE $${params.push(term)}
    )`);
  }

  return { params, where };
}

async function listTickets(actor, filters = {}) {
  const scope = await getActorScope(actor);
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const { params, where } = buildListQuery(scope, filters);

  const countSql = `
    SELECT COUNT(*) AS total
    FROM support_tickets st
    LEFT JOIN users u ON u.id = st.user_id
    LEFT JOIN organizers o ON o.id = st.organizer_id
    LEFT JOIN events ev ON ev.id = st.event_id
    WHERE ${where.join(' AND ')}
  `;
  const rowsSql = `
    ${buildTicketSelectSql(scope)}
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE
        WHEN st.status IN ('resolved', 'closed') THEN 3
        WHEN st.priority = 'urgent' THEN 0
        WHEN st.priority = 'high' THEN 1
        ELSE 2
      END ASC,
      st.last_message_at DESC,
      st.updated_at DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const [countRow, rows] = await Promise.all([
    queryOne(countSql, params),
    query(rowsSql, [...params, limit, offset]),
  ]);

  return {
    data: rows.rows.map((row) => ({ ...row, status_group: statusGroup(row.status) })),
    meta: {
      page,
      limit,
      total: parseInt(countRow?.total || 0, 10),
    },
  };
}

async function listMessages(actor, ticketId, options = {}) {
  const { scope } = await assertTicketAccess(actor, ticketId, canViewTicket);
  const includeInternal = scope.role === 'admin' && String(options.include_internal).toLowerCase() === 'true';
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 100, 1), 200);
  const where = ['sm.ticket_id = $1', 'sm.deleted_at IS NULL'];
  if (!includeInternal) where.push('sm.is_internal = FALSE');
  const rows = await query(
    `SELECT sm.*,
            u.name AS author_name,
            u.email AS author_email
     FROM support_messages sm
     LEFT JOIN users u ON u.id = sm.author_user_id
     WHERE ${where.join(' AND ')}
     ORDER BY sm.created_at ASC
     LIMIT $2`,
    [ticketId, limit]
  );
  const readColumn = readColumnForRole(scope.role);
  if (readColumn) {
    await query(
      `UPDATE support_tickets
       SET ${readColumn} = NOW()
       WHERE id = $1`,
      [ticketId]
    );
  }
  return rows.rows;
}

async function addMessage(actor, ticketId, payload) {
  const { scope, ticket } = await assertTicketAccess(actor, ticketId, canReplyToTicket);
  const body = String(payload.body || '').trim();
  if (!body) {
    const err = new Error('Message body is required');
    err.statusCode = 422;
    throw err;
  }

  const messageId = uuidv4();
  const isInternal = scope.role === 'admin' && payload.is_internal === true;
  const readColumn = readColumnForRole(scope.role);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO support_messages (id, ticket_id, author_user_id, author_role, body, is_internal, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        messageId,
        ticketId,
        actor.id,
        scope.role,
        body,
        isInternal,
        payload.attachments ? JSON.stringify(payload.attachments) : null,
      ]
    );
    await client.query(
      `UPDATE support_tickets
       SET updated_at = NOW(),
           last_message_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );
    if (readColumn) {
      await client.query(
        `UPDATE support_tickets
         SET ${readColumn} = NOW()
         WHERE id = $1`,
        [ticketId]
      );
    }
    await logEvent(client, ticketId, actor.id, scope.role, 'message_posted', {
      is_internal: isInternal,
      previous_status: ticket.status,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return queryOne(
    `SELECT sm.*,
            u.name AS author_name,
            u.email AS author_email
     FROM support_messages sm
     LEFT JOIN users u ON u.id = sm.author_user_id
     WHERE sm.id = $1`,
    [messageId]
  );
}

async function updateTicket(actor, ticketId, payload) {
  const { scope, ticket } = await assertTicketAccess(actor, ticketId, canViewTicket);
  const sets = ['updated_at = NOW()'];
  const params = [];
  const events = [];

  if (payload.status !== undefined) {
    if (!['admin', 'organizer'].includes(scope.role)) {
      const err = new Error('Insufficient permissions');
      err.statusCode = 403;
      throw err;
    }
    if (!INTERNAL_STATUSES.has(payload.status)) {
      const err = new Error('Invalid status');
      err.statusCode = 422;
      throw err;
    }
    if (scope.role === 'organizer') {
      assertOrganizerStatusUpdateAllowed(ticket.status, payload.status);
    }
    params.push(payload.status);
    sets.push(`status = $${params.length}`);
    if (['resolved', 'closed'].includes(payload.status)) {
      sets.push('closed_at = NOW()');
    } else {
      sets.push('closed_at = NULL');
    }
    events.push({ type: 'status_changed', payload: { from: ticket.status, to: payload.status } });
  }

  if (payload.priority !== undefined) {
    if (scope.role !== 'admin') {
      const err = new Error('Only super admin can update priority');
      err.statusCode = 403;
      throw err;
    }
    const priority = normalizePriority(payload.priority);
    if (!PRIORITIES.has(priority)) {
      const err = new Error('Invalid priority');
      err.statusCode = 422;
      throw err;
    }
    params.push(priority);
    sets.push(`priority = $${params.length}`);
    events.push({ type: 'priority_changed', payload: { from: ticket.priority, to: priority } });
  }

  if (payload.assigned_admin_id !== undefined) {
    if (scope.role !== 'admin') {
      const err = new Error('Only super admin can assign tickets');
      err.statusCode = 403;
      throw err;
    }
    params.push(payload.assigned_admin_id || null);
    sets.push(`assigned_admin_id = $${params.length}`);
    events.push({
      type: 'assignment_changed',
      payload: { from: ticket.assigned_admin_id, to: payload.assigned_admin_id || null },
    });
  }

  if (payload.resolution_note !== undefined) {
    if (!['admin', 'organizer'].includes(scope.role)) {
      const err = new Error('Insufficient permissions');
      err.statusCode = 403;
      throw err;
    }
    params.push(String(payload.resolution_note || '').slice(0, 5000));
    sets.push(`resolution_note = $${params.length}`);
  }

  if (sets.length === 1) return ticket;

  params.push(ticketId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE support_tickets
       SET ${sets.join(', ')}
       WHERE id = $${params.length}`,
      params
    );
    for (const event of events) {
      await logEvent(client, ticketId, actor.id, scope.role, event.type, event.payload);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getTicketById(ticketId, scope);
}

async function escalateTicket(actor, ticketId, reason) {
  const { scope, ticket } = await assertTicketAccess(actor, ticketId, canViewTicket);
  if (['resolved', 'closed'].includes(ticket.status)) {
    const err = new Error('Ticket is already closed');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE support_tickets
       SET status = 'escalated',
           escalation_level = escalation_level + 1,
           escalation_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reason || null, ticketId]
    );
    await logEvent(client, ticketId, actor.id, scope.role, 'escalated', {
      from: ticket.status,
      reason: reason || null,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getTicketById(ticketId, scope);
}

async function softDeleteTicket(actor, ticketId) {
  const { scope } = await assertTicketAccess(actor, ticketId, canSoftDeleteTicket);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE support_tickets
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );
    await logEvent(client, ticketId, actor.id, scope.role, 'ticket_deleted', {});
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { id: ticketId };
}

async function listEvents(actor, ticketId) {
  await assertTicketAccess(actor, ticketId, canViewTicket);
  const rows = await query(
    `SELECT se.*,
            u.name AS actor_name,
            u.email AS actor_email
     FROM support_events se
     LEFT JOIN users u ON u.id = se.actor_user_id
     WHERE se.ticket_id = $1
     ORDER BY se.created_at ASC`,
    [ticketId]
  );
  return rows.rows;
}

async function getAdminOverview() {
  const [countsRow, laneRows, unreadRows, recentEvents, recentMessages] = await Promise.all([
    queryOne(
      `${buildAdminTicketViewSql()}
       SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('new', 'in_review'))::int AS open_count,
         COUNT(*) FILTER (WHERE status IN ('waiting_organizer', 'escalated'))::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated_count,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
         COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
         COUNT(*) FILTER (WHERE sla_state = 'overdue')::int AS overdue_count,
         COUNT(*) FILTER (WHERE sla_state = 'due_soon')::int AS due_soon_count,
         COALESCE(SUM(unread_count), 0)::int AS unread_total
       FROM ticket_view`
    ),
    query(
      `${buildAdminTicketViewSql()}
       SELECT owner_lane, COUNT(*)::int AS total
       FROM ticket_view
       GROUP BY owner_lane`
    ),
    query(
      `${buildAdminTicketViewSql()}
       SELECT
         COUNT(*) FILTER (WHERE unread_count > 0)::int AS tickets_with_unread,
         COALESCE(SUM(unread_count), 0)::int AS total_unread
       FROM ticket_view`
    ),
    query(
      `SELECT se.id, se.ticket_id, se.actor_user_id, se.actor_role, se.event_type, se.payload, se.created_at,
              st.ticket_ref, st.subject, st.status, st.priority, st.order_id,
              u.name AS actor_name, u.email AS actor_email
       FROM support_events se
       JOIN support_tickets st ON st.id = se.ticket_id
       LEFT JOIN users u ON u.id = se.actor_user_id
       WHERE st.deleted_at IS NULL
       ORDER BY se.created_at DESC
       LIMIT 25`
    ),
    query(
      `SELECT sm.id, sm.ticket_id, sm.author_user_id, sm.author_role, sm.body, sm.is_internal, sm.created_at,
              st.ticket_ref, st.subject,
              u.name AS author_name, u.email AS author_email
       FROM support_messages sm
       JOIN support_tickets st ON st.id = sm.ticket_id
       LEFT JOIN users u ON u.id = sm.author_user_id
       WHERE sm.deleted_at IS NULL
         AND sm.is_internal = FALSE
         AND st.deleted_at IS NULL
       ORDER BY sm.created_at DESC
       LIMIT 15`
    ),
  ]);

  const laneBreakdown = laneRows.rows.reduce((acc, row) => {
    acc[row.owner_lane] = parseInt(row.total, 10);
    return acc;
  }, { super_admin: 0, organizer: 0 });

  return {
    metrics: {
      total: parseInt(countsRow?.total || 0, 10),
      open: parseInt(countsRow?.open_count || 0, 10),
      pending: parseInt(countsRow?.pending_count || 0, 10),
      escalated: parseInt(countsRow?.escalated_count || 0, 10),
      resolved: parseInt(countsRow?.resolved_count || 0, 10),
      closed: parseInt(countsRow?.closed_count || 0, 10),
      overdue: parseInt(countsRow?.overdue_count || 0, 10),
      due_soon: parseInt(countsRow?.due_soon_count || 0, 10),
      unread_total: parseInt(countsRow?.unread_total || 0, 10),
      tickets_with_unread: parseInt(unreadRows.rows[0]?.tickets_with_unread || 0, 10),
    },
    lanes: laneBreakdown,
    recent_events: recentEvents.rows,
    recent_messages: recentMessages.rows,
  };
}

module.exports = {
  createTicket,
  listTickets,
  getTicketById,
  getTicketForActor,
  listMessages,
  addMessage,
  updateTicket,
  escalateTicket,
  softDeleteTicket,
  listEvents,
  getAdminOverview,
  normalizePriority,
};
