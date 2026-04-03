const { query, queryOne } = require('../config/db');

const toExecutor = (client) => client || { query };
let ensureNotificationsTablePromise = null;

async function ensureNotificationsTable(client = null) {
  if (client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type          VARCHAR(60)  NOT NULL,
        title         VARCHAR(180) NOT NULL,
        message       TEXT         NOT NULL,
        link_url      VARCHAR(255),
        dedupe_key    VARCHAR(180),
        is_read       BOOLEAN      NOT NULL DEFAULT FALSE,
        read_at       TIMESTAMPTZ,
        data          JSONB        NOT NULL DEFAULT '{}'::jsonb,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC)`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe
      ON notifications(user_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL
    `);
    return;
  }

  if (!ensureNotificationsTablePromise) {
    ensureNotificationsTablePromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type          VARCHAR(60)  NOT NULL,
          title         VARCHAR(180) NOT NULL,
          message       TEXT         NOT NULL,
          link_url      VARCHAR(255),
          dedupe_key    VARCHAR(180),
          is_read       BOOLEAN      NOT NULL DEFAULT FALSE,
          read_at       TIMESTAMPTZ,
          data          JSONB        NOT NULL DEFAULT '{}'::jsonb,
          created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC)`);
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe
        ON notifications(user_id, dedupe_key)
        WHERE dedupe_key IS NOT NULL
      `);
    })().catch((err) => {
      ensureNotificationsTablePromise = null;
      throw err;
    });
  }

  return ensureNotificationsTablePromise;
}

async function createNotification({
  userId,
  type,
  title,
  message,
  linkUrl = null,
  data = {},
  dedupeKey = null,
}, client = null) {
  if (!userId || !type || !title || !message) return null;

  await ensureNotificationsTable(client);
  const executor = toExecutor(client);
  const payload = JSON.stringify(data || {});

  if (!dedupeKey) {
    const res = await executor.query(
      `INSERT INTO notifications
         (user_id, type, title, message, link_url, data)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, user_id, type, title, message, link_url, is_read, read_at, data, created_at`,
      [userId, type, title, message, linkUrl, payload]
    );
    return res.rows[0] || null;
  }

  const res = await executor.query(
    `INSERT INTO notifications
       (user_id, type, title, message, link_url, dedupe_key, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, dedupe_key)
       WHERE dedupe_key IS NOT NULL
     DO UPDATE
       SET type = EXCLUDED.type,
           title = EXCLUDED.title,
           message = EXCLUDED.message,
           link_url = EXCLUDED.link_url,
           data = EXCLUDED.data,
           is_read = FALSE,
           read_at = NULL,
           updated_at = NOW()
     RETURNING id, user_id, type, title, message, link_url, is_read, read_at, data, created_at`,
    [userId, type, title, message, linkUrl, dedupeKey, payload]
  );
  return res.rows[0] || null;
}

async function listNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  await ensureNotificationsTable();
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const params = [userId];
  const where = [`user_id = $1`];

  if (unreadOnly) where.push(`is_read = FALSE`);

  const [rows, unreadSummary] = await Promise.all([
    query(
      `SELECT id, type, title, message, link_url, is_read, read_at, data, created_at
       FROM notifications
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $2`,
      [...params, safeLimit]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_id = $1
         AND is_read = FALSE`,
      [userId]
    ),
  ]);

  return {
    items: rows.rows,
    unreadCount: parseInt(unreadSummary?.unread_count || 0, 10),
  };
}

async function markNotificationRead(userId, notificationId) {
  await ensureNotificationsTable();
  return queryOne(
    `UPDATE notifications
     SET is_read = TRUE,
         read_at = COALESCE(read_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
       AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );
}

async function markAllNotificationsRead(userId) {
  await ensureNotificationsTable();
  const res = await query(
    `UPDATE notifications
     SET is_read = TRUE,
         read_at = COALESCE(read_at, NOW()),
         updated_at = NOW()
     WHERE user_id = $1
       AND is_read = FALSE`,
    [userId]
  );
  return res.rowCount || 0;
}

async function createOrderConfirmedNotification(client, {
  userId,
  orderId,
  orderRef,
  eventTitle,
  ticketCount,
}) {
  return createNotification({
    userId,
    type: 'order_confirmed',
    title: 'Booking confirmed',
    message: `${ticketCount} ticket${ticketCount === 1 ? '' : 's'} for ${eventTitle} are ready.`,
    linkUrl: '/dashboard/tickets',
    dedupeKey: `order_confirmed:${orderId}`,
    data: {
      order_id: orderId,
      order_ref: orderRef,
      event_title: eventTitle,
      ticket_count: ticketCount,
    },
  }, client);
}

async function createOrderRefundedNotification(client, {
  userId,
  orderId,
  orderRef,
  eventTitle,
  amount,
  reason,
}) {
  return createNotification({
    userId,
    type: 'order_refunded',
    title: 'Refund processed',
    message: `${eventTitle} was refunded${reason ? `: ${reason}` : '.'}`,
    linkUrl: '/dashboard/history',
    dedupeKey: `order_refunded:${orderId}`,
    data: {
      order_id: orderId,
      order_ref: orderRef,
      event_title: eventTitle,
      amount: Number(amount || 0),
      reason: reason || null,
    },
  }, client);
}

async function createOrganizerPayoutNotification(client, {
  userId,
  payoutId,
  amount,
  method,
  reference,
}) {
  return createNotification({
    userId,
    type: 'organizer_payout_recorded',
    title: 'Payout recorded',
    message: `A payout of KES ${Number(amount || 0).toLocaleString('en-KE')} was recorded to your ${method || 'account'}.`,
    linkUrl: '/organizer/earnings',
    dedupeKey: `organizer_payout:${payoutId}`,
    data: {
      payout_id: payoutId,
      amount: Number(amount || 0),
      method: method || null,
      reference: reference || null,
    },
  }, client);
}

async function createSupportNotification(client, {
  userId,
  type,
  title,
  message,
  linkUrl,
  dedupeKey = null,
  data = {},
}) {
  return createNotification({
    userId,
    type,
    title,
    message,
    linkUrl,
    dedupeKey,
    data,
  }, client);
}

async function createWaitlistAvailableNotification(client, {
  userId,
  eventId,
  eventTitle,
  waitlistId,
}) {
  return createNotification({
    userId,
    type: 'waitlist_ticket_available',
    title: 'Ticket available',
    message: `A ticket is now available for ${eventTitle}.`,
    linkUrl: `/checkout/${eventId}`,
    dedupeKey: `waitlist_available:${waitlistId}`,
    data: {
      event_id: eventId,
      event_title: eventTitle,
      waitlist_id: waitlistId,
    },
  }, client);
}

module.exports = {
  ensureNotificationsTable,
  createNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createOrderConfirmedNotification,
  createOrderRefundedNotification,
  createOrganizerPayoutNotification,
  createSupportNotification,
  createWaitlistAvailableNotification,
};
