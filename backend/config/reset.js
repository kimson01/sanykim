// config/reset.js
// Drops ALL Sany Adventures tables then re-runs migrate + seed.
// USE ONLY IN DEVELOPMENT — this deletes all data.

require('dotenv').config();
const { pool, waitForDb } = require('./db');

const DROP_SQL = `
  DROP TABLE IF EXISTS
    support_events,
    support_messages,
    attendees,
    tickets,
    transactions,
    order_items,
    orders,
    revenue_ledger,
    support_tickets,
    payouts,
    ticket_types,
    waitlist,
    events,
    promo_codes,
    organizers,
    categories,
    platform_settings,
    users
  CASCADE
`;

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌  reset.js must not run in production.');
    process.exit(1);
  }

  const ready = await waitForDb();
  if (!ready) {
    console.error('\n❌ Reset aborted: database is not reachable.');
    console.error('   Check DATABASE_URL / network, or switch to local Postgres for development.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log('⚠️  Dropping all tables…');
    await client.query(DROP_SQL);
    console.log('✅  Tables dropped.\n');
  } catch (err) {
    console.error('❌  Drop failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  // Re-run migrate then seed as child processes so each gets a fresh pool
  const { execSync } = require('child_process');
  console.log('🔄  Running migrate…');
  execSync('node config/migrate.js', { stdio: 'inherit' });
  console.log('\n🌱  Running seed…');
  execSync('node config/seed.js', { stdio: 'inherit' });
}

reset();
