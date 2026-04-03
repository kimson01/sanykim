// config/migrate.js — Creates all database tables for Sany Adventures
require('dotenv').config();
const { pool, waitForDb } = require('./db');

// ─────────────────────────────────────────────────────────────────────
// Rules:
//  1. Every statement runs individually — no semicolons, no batching.
//  2. All CREATE TABLE statements come first (in dependency order).
//  3. All ALTER TABLE statements come AFTER every table is created.
//  4. Indexes come after ALTERs.
//  5. Seed data (platform_settings) comes last.
// ─────────────────────────────────────────────────────────────────────

const statements = [

  // ── EXTENSION ──────────────────────────────────────────────────────
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  // ── USERS ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(255) UNIQUE NOT NULL,
    password            VARCHAR(255) NOT NULL,
    phone               VARCHAR(30),
    role                VARCHAR(20)  NOT NULL DEFAULT 'user',
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    email_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
    email_verify_token  VARCHAR(64),
    email_verify_expires TIMESTAMPTZ,
    reset_token         VARCHAR(64),
    reset_token_expires TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // ── ORGANIZERS ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS organizers (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name          VARCHAR(200) NOT NULL,
    description           TEXT,
    website               VARCHAR(255),
    logo_url              VARCHAR(500),
    slug                  VARCHAR(200),
    -- Onboarding / vetting fields
    business_type         VARCHAR(30)  DEFAULT 'individual',
    id_type               VARCHAR(30)  DEFAULT 'national_id',
    id_number             VARCHAR(80),
    physical_address      TEXT,
    event_types           TEXT[],
    expected_monthly_events VARCHAR(20),
    social_media          VARCHAR(200),
    terms_agreed          BOOLEAN      NOT NULL DEFAULT FALSE,
    terms_agreed_at       TIMESTAMPTZ,
    rejection_reason      TEXT,
    admin_notes           TEXT,
    -- Status & financials
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
    commission    NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    total_revenue      NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    available_balance  NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    refund_liability   NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_paid_out     NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // ── CATEGORIES ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS categories (
    id   SERIAL      PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL
  )`,

  // ── EVENTS ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS events (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id  UUID         NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    category_id   INTEGER      REFERENCES categories(id) ON DELETE SET NULL,
    title         VARCHAR(300) NOT NULL,
    slug          VARCHAR(320) UNIQUE NOT NULL,
    description   TEXT,
    banner_url    VARCHAR(500),
    location      VARCHAR(300),
    location_type VARCHAR(20)  NOT NULL DEFAULT 'physical',
    virtual_url   VARCHAR(500),
    event_date    DATE         NOT NULL,
    start_time    TIME         NOT NULL,
    end_time      TIME,
    capacity      INTEGER      NOT NULL DEFAULT 100,
    total_sold    INTEGER      NOT NULL DEFAULT 0,
    status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
    is_featured   BOOLEAN      NOT NULL DEFAULT FALSE,
    tags          TEXT[],
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // ── TICKET TYPES ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id    UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        VARCHAR(100)  NOT NULL,
    price       NUMERIC(12,2) NOT NULL DEFAULT 0,
    quantity    INTEGER       NOT NULL DEFAULT 0,
    sold        INTEGER       NOT NULL DEFAULT 0,
    color       VARCHAR(10)   DEFAULT '#22c55e',
    description VARCHAR(300),
    sale_start  TIMESTAMPTZ,
    sale_end    TIMESTAMPTZ,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  // ── ORDERS ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS orders (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_ref      VARCHAR(30)   UNIQUE NOT NULL,
    user_id        UUID          REFERENCES users(id) ON DELETE SET NULL,
    event_id       UUID          NOT NULL REFERENCES events(id),
    attendee_name  VARCHAR(150)  NOT NULL,
    attendee_email VARCHAR(255)  NOT NULL,
    attendee_phone VARCHAR(30)   NOT NULL,
    subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_amt NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(30)   DEFAULT 'mpesa',
    notes          TEXT,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  // ── ORDER ITEMS ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_items (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id       UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id UUID          NOT NULL REFERENCES ticket_types(id),
    quantity       INTEGER       NOT NULL DEFAULT 1,
    unit_price     NUMERIC(12,2) NOT NULL,
    subtotal       NUMERIC(14,2) NOT NULL
  )`,

  // ── TRANSACTIONS ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS transactions (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id      UUID          NOT NULL REFERENCES orders(id),
    txn_ref       VARCHAR(60)   UNIQUE NOT NULL,
    amount        NUMERIC(14,2) NOT NULL,
    currency      VARCHAR(10)   NOT NULL DEFAULT 'KES',
    method        VARCHAR(30)   NOT NULL DEFAULT 'mpesa',
    status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
    provider_data JSONB,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  // ── PAYMENT PROVIDER EVENTS ────────────────────────────────────────
  // Stores raw callback events for dedupe, audit, and replay safety.
  `CREATE TABLE IF NOT EXISTS payment_provider_events (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider            VARCHAR(30)  NOT NULL,
    event_type          VARCHAR(50)  NOT NULL,
    event_key           VARCHAR(120) NOT NULL,
    checkout_request_id VARCHAR(120),
    txn_ref             VARCHAR(60),
    order_id            UUID         REFERENCES orders(id) ON DELETE SET NULL,
    result_code         INTEGER,
    status              VARCHAR(20)  NOT NULL DEFAULT 'received',
    payload             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (provider, event_type, event_key)
  )`,

  // ── TICKETS ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS tickets (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_code    VARCHAR(60) UNIQUE NOT NULL,
    order_id       UUID        NOT NULL REFERENCES orders(id),
    order_item_id  UUID        NOT NULL REFERENCES order_items(id),
    user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
    event_id       UUID        NOT NULL REFERENCES events(id),
    ticket_type_id UUID        NOT NULL REFERENCES ticket_types(id),
    seat_number    VARCHAR(30),
    qr_data        TEXT        NOT NULL,
    qr_url         TEXT,
    is_scanned     BOOLEAN     NOT NULL DEFAULT FALSE,
    scanned_at     TIMESTAMPTZ,
    scanned_by     UUID        REFERENCES users(id),
    is_voided      BOOLEAN     NOT NULL DEFAULT FALSE,
    voided_at      TIMESTAMPTZ,
    void_reason    TEXT,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── ATTENDEES ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS attendees (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id      UUID         NOT NULL REFERENCES events(id),
    ticket_id     UUID         NOT NULL REFERENCES tickets(id),
    order_id      UUID         NOT NULL REFERENCES orders(id),
    user_id       UUID         REFERENCES users(id),
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(30),
    ticket_type   VARCHAR(100),
    checked_in    BOOLEAN      NOT NULL DEFAULT FALSE,
    checked_in_at TIMESTAMPTZ,
    reminder_sent BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // ── PROMO CODES ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS promo_codes (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    code           VARCHAR(50)   UNIQUE NOT NULL,
    event_id       UUID          REFERENCES events(id) ON DELETE CASCADE,
    discount_type  VARCHAR(20)   NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(12,2) NOT NULL,
    max_uses       INTEGER,
    used_count     INTEGER       NOT NULL DEFAULT 0,
    valid_from     TIMESTAMPTZ,
    valid_until    TIMESTAMPTZ,
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  // ── REVENUE LEDGER ─────────────────────────────────────────────────
  // One row per financial event: sale, refund, or payout.
  // This gives a complete auditable trail of every KES that moved.
  `CREATE TABLE IF NOT EXISTS revenue_ledger (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id   UUID          NOT NULL REFERENCES organizers(id),
    order_id       UUID          REFERENCES orders(id) ON DELETE SET NULL,
    type           VARCHAR(30)   NOT NULL,
    -- type values:
    --   'sale'        ticket sold — organizer credited net amount
    --   'refund'      ticket refunded — organizer debited net amount
    --   'commission'  platform fee on a sale (negative to organizer)
    --   'payout'      admin disbursed money to organizer
    --   'payout_reversal' payout cancelled / bounced
    gross_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_amt NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    running_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    description    TEXT,
    created_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  // ── PAYOUTS ────────────────────────────────────────────────────────
  // Admin records each disbursement to an organizer here.
  `CREATE TABLE IF NOT EXISTS payouts (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id   UUID          NOT NULL REFERENCES organizers(id),
    amount         NUMERIC(14,2) NOT NULL,
    method         VARCHAR(30)   NOT NULL DEFAULT 'mpesa',
    reference      VARCHAR(100),
    -- M-PESA transaction ID, bank ref, etc.
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
    -- pending | completed | failed | reversed
    note           TEXT,
    processed_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
    processed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  // ── SUPPORT TICKETS / CONFLICTS ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS support_tickets (
    id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_ref        VARCHAR(30)   UNIQUE NOT NULL,
    user_id           UUID          REFERENCES users(id) ON DELETE SET NULL,
    organizer_id      UUID          REFERENCES organizers(id) ON DELETE SET NULL,
    order_id          UUID          REFERENCES orders(id) ON DELETE SET NULL,
    event_id          UUID          REFERENCES events(id) ON DELETE SET NULL,
    category          VARCHAR(30)   NOT NULL,
    subject           VARCHAR(160)  NOT NULL,
    message           TEXT          NOT NULL,
    status            VARCHAR(30)   NOT NULL DEFAULT 'new',
    priority          VARCHAR(20)   NOT NULL DEFAULT 'medium',
    escalation_level  INTEGER       NOT NULL DEFAULT 0,
    escalation_reason TEXT,
    resolution_note   TEXT,
    created_by_role   VARCHAR(20)   NOT NULL DEFAULT 'guest',
    created_by_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    assigned_admin_id UUID          REFERENCES users(id) ON DELETE SET NULL,
    source            VARCHAR(30)   NOT NULL DEFAULT 'web',
    channel           VARCHAR(30)   NOT NULL DEFAULT 'dashboard',
    last_message_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    user_last_read_at TIMESTAMPTZ,
    organizer_last_read_at TIMESTAMPTZ,
    admin_last_read_at TIMESTAMPTZ,
    closed_at         TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS support_messages (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id      UUID         NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    author_role    VARCHAR(20)  NOT NULL,
    body           TEXT         NOT NULL,
    is_internal    BOOLEAN      NOT NULL DEFAULT FALSE,
    attachments    JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    edited_at      TIMESTAMPTZ,
    deleted_at     TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS support_events (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id     UUID         NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    actor_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    actor_role    VARCHAR(20)  NOT NULL,
    event_type    VARCHAR(50)  NOT NULL,
    payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    action_type   VARCHAR(60)  NOT NULL,
    entity_type   VARCHAR(40)  NOT NULL,
    entity_id     UUID,
    summary       VARCHAR(255) NOT NULL,
    payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS platform_activity_logs (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
    actor_role    VARCHAR(30)  NOT NULL DEFAULT 'system',
    domain        VARCHAR(40)  NOT NULL,
    event_type    VARCHAR(80)  NOT NULL,
    entity_type   VARCHAR(40)  NOT NULL,
    entity_id     UUID,
    summary       VARCHAR(255) NOT NULL,
    severity      VARCHAR(20)  NOT NULL DEFAULT 'info',
    ip_address    VARCHAR(80),
    user_agent    TEXT,
    payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS reconciliation_issues (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_key     VARCHAR(180) NOT NULL UNIQUE,
    issue_type    VARCHAR(80)  NOT NULL,
    entity_type   VARCHAR(40)  NOT NULL,
    entity_id     UUID,
    severity      VARCHAR(20)  NOT NULL DEFAULT 'warning',
    summary       VARCHAR(255) NOT NULL,
    details       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    status        VARCHAR(20)  NOT NULL DEFAULT 'open',
    first_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
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
  )`,

  // ── PLATFORM SETTINGS ──────────────────────────────────────────────
  // ── WAITLIST ───────────────────────────────────────────────────────
  // Captures demand for sold-out events.
  // When a ticket is refunded, the top waitlist entry is emailed an offer.
  `CREATE TABLE IF NOT EXISTS waitlist (
    id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id    UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id     UUID          REFERENCES users(id) ON DELETE SET NULL,
    name        VARCHAR(150)  NOT NULL,
    email       VARCHAR(255)  NOT NULL,
    phone       VARCHAR(30),
    notified    BOOLEAN       NOT NULL DEFAULT FALSE,
    notified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, email)
  )`,

  `CREATE TABLE IF NOT EXISTS platform_settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // ── UNIQUE CONSTRAINT — ticket_types(event_id, name) ─────────────────
  // ADD CONSTRAINT IF NOT EXISTS is not supported on all PG versions.
  // Use a DO block that checks pg_constraint first — safe on any PG 9.x+.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'uq_tt_event_name'
         AND conrelid = 'ticket_types'::regclass
     ) THEN
       ALTER TABLE ticket_types
         ADD CONSTRAINT uq_tt_event_name UNIQUE (event_id, name);
     END IF;
   END
   $$`,

  // ── ALTER TABLE — add new columns to existing databases ────────────
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS available_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS refund_liability  NUMERIC(14,2) NOT NULL DEFAULT 0.00`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS total_paid_out    NUMERIC(14,2) NOT NULL DEFAULT 0.00`,
  // Organizer onboarding fields (safe to run on existing databases)
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS business_type         VARCHAR(30)  DEFAULT 'individual'`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS id_type               VARCHAR(30)  DEFAULT 'national_id'`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS id_number             VARCHAR(80)`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS physical_address      TEXT`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS event_types           TEXT[]`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS expected_monthly_events VARCHAR(20)`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS social_media          VARCHAR(200)`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS terms_agreed          BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS terms_agreed_at       TIMESTAMPTZ`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS rejection_reason      TEXT`,
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS admin_notes           TEXT`,
  // These use IF NOT EXISTS so they are safe to run multiple times.
  // They MUST come after all CREATE TABLE statements above.
  // Waitlist table (safe — CREATE TABLE IF NOT EXISTS above handles new DBs)
  `ALTER TABLE organizers ADD COLUMN IF NOT EXISTS slug VARCHAR(200)`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS email_verify_token   VARCHAR(64)`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS reset_token          VARCHAR(64)`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`,
  `ALTER TABLE orders     ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url         VARCHAR(255)`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key       VARCHAR(180)`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read          BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at          TIMESTAMPTZ`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data             JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE attendees  ADD COLUMN IF NOT EXISTS reminder_sent       BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE tickets    ADD COLUMN IF NOT EXISTS is_voided           BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE tickets    ADD COLUMN IF NOT EXISTS voided_at           TIMESTAMPTZ`,
  `ALTER TABLE tickets    ADD COLUMN IF NOT EXISTS void_reason         TEXT`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS source          VARCHAR(30) NOT NULL DEFAULT 'web'`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS channel         VARCHAR(30) NOT NULL DEFAULT 'dashboard'`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS user_last_read_at TIMESTAMPTZ`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS organizer_last_read_at TIMESTAMPTZ`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS admin_last_read_at TIMESTAMPTZ`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ`,
  `UPDATE support_tickets SET priority = 'urgent' WHERE priority = 'critical'`,
  `UPDATE support_tickets SET last_message_at = COALESCE(updated_at, created_at) WHERE last_message_at IS NULL`,

  // ── INDEXES ────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_date      ON events(event_date)`,
  `CREATE INDEX IF NOT EXISTS idx_events_status    ON events(status)`,
  `CREATE INDEX IF NOT EXISTS idx_events_category  ON events(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user      ON orders(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_event     ON orders(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user_created
   ON orders(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status_created
   ON orders(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_event_status_created
   ON orders(event_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_expires_at
   ON orders(status, expires_at)
   WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_event    ON tickets(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_user     ON tickets(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_code     ON tickets(ticket_code)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_voided   ON tickets(is_voided, event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_order    ON tickets(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_event_issued
   ON tickets(event_id, issued_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_attendees_event  ON attendees(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendees_ticket ON attendees(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tt_event         ON ticket_types(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order
   ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_order
   ON transactions(order_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_checkout_request_id
   ON orders((notes::jsonb ->> 'checkout_request_id'))
   WHERE notes IS NOT NULL
     AND (notes::jsonb ->> 'checkout_request_id') IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_payment_provider_events_created
   ON payment_provider_events(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_provider_events_order
   ON payment_provider_events(order_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_provider_events_checkout
   ON payment_provider_events(provider, checkout_request_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_provider_events_txn_ref
   ON payment_provider_events(txn_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_events_org_status_date
   ON events(organizer_id, status, event_date DESC)`,

  // ── Additional indexes for performance ─────────────────────────────
  // M-PESA callback looks up orders by the CheckoutRequestID stored in notes::jsonb
  `CREATE INDEX IF NOT EXISTS idx_orders_notes_checkout
   ON orders((notes::jsonb ->> 'checkout_request_id'))
   WHERE notes IS NOT NULL`,

  // Reminder job queries attendees by event_id + reminder_sent
  `CREATE INDEX IF NOT EXISTS idx_attendees_reminder
   ON attendees(event_id, reminder_sent)
   WHERE reminder_sent = FALSE`,

  // Attendees email lookup (used in order status polling auth check)
  `CREATE INDEX IF NOT EXISTS idx_attendees_email  ON attendees(email)`,

  // Orders by attendee email (guest checkout lookup)
  `CREATE INDEX IF NOT EXISTS idx_orders_email     ON orders(attendee_email)`,

  // Ticket types active lookup
  `CREATE INDEX IF NOT EXISTS idx_tt_active        ON ticket_types(event_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_organizer ON revenue_ledger(organizer_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_order     ON revenue_ledger(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_waitlist_event   ON waitlist(event_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_waitlist_email   ON waitlist(email)`,
  `CREATE INDEX IF NOT EXISTS idx_payouts_organizer ON payouts(organizer_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payouts_status    ON payouts(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_status_method
   ON transactions(status, method, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_user      ON support_tickets(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_organizer ON support_tickets(organizer_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_status    ON support_tickets(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_order     ON support_tickets(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_support_visible_user
   ON support_tickets(user_id, last_message_at DESC)
   WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_support_visible_organizer
   ON support_tickets(organizer_id, last_message_at DESC)
   WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_support_admin_filters
   ON support_tickets(status, priority, last_message_at DESC)
   WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
   ON support_messages(ticket_id, created_at ASC)
   WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_author
   ON support_messages(author_user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_events_ticket_created
   ON support_events(ticket_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_logs_created
   ON admin_activity_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_logs_actor
   ON admin_activity_logs(actor_user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_logs_entity
   ON admin_activity_logs(entity_type, entity_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_platform_logs_created
   ON platform_activity_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_platform_logs_domain
   ON platform_activity_logs(domain, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_platform_logs_actor
   ON platform_activity_logs(actor_user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_platform_logs_entity
   ON platform_activity_logs(entity_type, entity_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_status
   ON reconciliation_issues(status, severity, last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_entity
   ON reconciliation_issues(entity_type, entity_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_created
   ON notifications(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
   ON notifications(user_id, is_read, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe
   ON notifications(user_id, dedupe_key)
   WHERE dedupe_key IS NOT NULL`,

  // ── DEFAULT PLATFORM SETTINGS ──────────────────────────────────────
  `INSERT INTO platform_settings (key, value) VALUES
     ('commission_rate', '10'),
     ('platform_name',   'Sany Adventures'),
     ('support_email',   'support@sanyadventures.com'),
     ('currency',        'KES'),
     ('terms_and_conditions', 'Organizer must provide accurate event information, comply with Kenyan law, and accept platform commission/refund policies.'),
     ('security_enforce_email_verification', 'true'),
     ('security_require_organizer_kyc', 'true'),
     ('security_fraud_auto_block', 'true'),
     ('security_max_orders_per_hour_per_ip', '20'),
     ('trust_show_buyer_protection', 'true'),
     ('trust_show_trust_badges', 'true'),
     ('trust_buyer_protection_text', 'Protected checkout: if payment succeeds and your ticket is not issued, contact support for priority resolution within 24 hours.')
   ON CONFLICT (key) DO NOTHING`,
];

async function migrate() {
  const ready = await waitForDb();
  if (!ready) {
    console.error('\n❌ Migration aborted: database is not reachable.');
    console.error('   Check DATABASE_URL / network, or switch to local Postgres for development.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...\n');
    for (const sql of statements) {
      const label = sql.trim().replace(/\s+/g, ' ').slice(0, 65);
      process.stdout.write(`   ${label}…`);
      await client.query(sql);
      process.stdout.write(' ok\n');
    }
    console.log('\n✅ All tables and indexes created successfully.');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
