// config/seed.js — Seeds the Sany Adventures database with demo data
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, waitForDb } = require('./db');

// ── helpers ──────────────────────────────────────────────────
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const slug6 = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function seed() {
  const ready = await waitForDb();
  if (!ready) {
    console.error('\n❌ Seed aborted: database is not reachable.');
    console.error('   Check DATABASE_URL / network, or switch to local Postgres for development.');
    process.exit(1);
  }

  const client = await pool.connect();
  console.log('\n🌱  Starting Sany Adventures seed...\n');

  try {
    await client.query('BEGIN');

    // ─── 1. CATEGORIES ────────────────────────────────────────
    console.log('  → categories...');
    const categories = [
      { name: 'Music',      slug: 'music'      },
      { name: 'Tech',       slug: 'tech'       },
      { name: 'Art',        slug: 'art'        },
      { name: 'Food',       slug: 'food'       },
      { name: 'Sports',     slug: 'sports'     },
      { name: 'Business',   slug: 'business'   },
      { name: 'Networking', slug: 'networking' },
      { name: 'Comedy',     slug: 'comedy'     },
      { name: 'Film',       slug: 'film'       },
      { name: 'Fashion',    slug: 'fashion'    },
    ];
    for (const cat of categories) {
      await client.query(
        `INSERT INTO categories (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO NOTHING`,
        [cat.name, cat.slug]
      );
    }

    // ─── 2. ADMIN ─────────────────────────────────────────────
    console.log('  → admin user...');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@sanyadventures.com';
    const adminName  = process.env.ADMIN_NAME  || 'Super Admin';
    const adminPwd   = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@1234', 12);

    // Upsert: if email exists, update password so credentials always match .env
    await client.query(
      `INSERT INTO users (id, name, email, password, role, email_verified)
       VALUES ($1, $2, $3, $4, 'admin', TRUE)
       ON CONFLICT (email)
       DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password,
                     email_verified = TRUE`,
      [uuidv4(), adminName, adminEmail, adminPwd]
    );

    // ─── 3. ORGANIZER USERS ───────────────────────────────────
    console.log('  → organizers...');
    const orgPwd = await bcrypt.hash('Organizer@123', 12);

    // Each organizer user — upsert so re-seeding is safe
    const orgUserDefs = [
      { name: 'James Kariuki', email: 'james@nairobievents.com', phone: '+254722100001' },
      { name: 'Amina Hassan',  email: 'amina@techkenya.com',     phone: '+254733200002' },
      { name: 'Brian Otieno',  email: 'brian@culturevibes.co',   phone: '+254711300003' },
    ];

    const orgUserIds = [];
    for (const u of orgUserDefs) {
      // Upsert user; retrieve the actual id (old or new)
      const res = await client.query(
        `INSERT INTO users (id, name, email, password, phone, role, email_verified)
         VALUES ($1, $2, $3, $4, $5, 'organizer', TRUE)
         ON CONFLICT (email)
         DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password,
                       email_verified = TRUE
         RETURNING id`,
        [uuidv4(), u.name, u.email, orgPwd, u.phone]
      );
      orgUserIds.push(res.rows[0].id);
    }

    // Organizer profiles — look up by user_id so upsert is idempotent
    const orgProfileDefs = [
      { idx: 0, company: 'Nairobi Events Co.',  status: 'approved', commission: 10, revenue: 185000 },
      { idx: 1, company: 'TechHub Kenya',        status: 'pending',  commission: 10, revenue: 0       },
      { idx: 2, company: 'Culture Vibes Africa', status: 'approved', commission: 8,  revenue: 62000   },
    ];

    const orgIds = [];
    for (const o of orgProfileDefs) {
      const userId = orgUserIds[o.idx];
      // Check if organizer profile already exists for this user
      const existing = await client.query(
        `SELECT id FROM organizers WHERE user_id = $1`, [userId]
      );
      let orgId;
      if (existing.rows.length > 0) {
        orgId = existing.rows[0].id;
        await client.query(
          `UPDATE organizers
           SET company_name = $1, status = $2, commission = $3, total_revenue = $4
           WHERE id = $5`,
          [o.company, o.status, o.commission, o.revenue, orgId]
        );
      } else {
        orgId = uuidv4();
        await client.query(
          `INSERT INTO organizers
             (id, user_id, company_name, status, commission, total_revenue)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orgId, userId, o.company, o.status, o.commission, o.revenue]
        );
      }
      orgIds.push(orgId);
    }

    // ─── 4. ATTENDEE USERS ────────────────────────────────────
    console.log('  → attendees...');
    const userPwd = await bcrypt.hash('User@1234', 12);

    const attendeeDefs = [
      { name: 'Alice Wanjiku', email: 'alice@gmail.com', phone: '+254712345678' },
      { name: 'David Mwangi',  email: 'david@gmail.com', phone: '+254798765432' },
      { name: 'Grace Njeri',   email: 'grace@gmail.com', phone: '+254700111222' },
    ];

    const attendeeIds = [];
    for (const u of attendeeDefs) {
      const res = await client.query(
        `INSERT INTO users (id, name, email, password, phone, role, email_verified)
         VALUES ($1, $2, $3, $4, $5, 'user', TRUE)
         ON CONFLICT (email)
         DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password,
                       email_verified = TRUE
         RETURNING id`,
        [uuidv4(), u.name, u.email, userPwd, u.phone]
      );
      attendeeIds.push({ id: res.rows[0].id, ...u });
    }

    // ─── 5. CATEGORY MAP ──────────────────────────────────────
    const catRows = await client.query(`SELECT id, slug FROM categories`);
    const catMap  = {};
    catRows.rows.forEach(r => { catMap[r.slug] = r.id; });

    // ─── 6. EVENTS ────────────────────────────────────────────
    console.log('  → events...');
    const eventDefs = [
      {
        id: uuidv4(), orgIdx: 0, cat: 'music',
        title: 'Nairobi Jazz Festival',
        slug:  'nairobi-jazz-festival-2025',
        desc:  'A three-day jazz extravaganza featuring local and international artists at KICC Gardens.',
        banner: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
        location: 'KICC Gardens, Nairobi CBD', locationType: 'physical',
        date: '2025-07-15', startTime: '18:00', endTime: '23:00',
        capacity: 2000, sold: 847, status: 'published',
        tags: ['Jazz', 'Live Music', 'Outdoor'],
        tickets: [
          { name: 'VIP',        price: 5000, quantity: 200,  sold: 187, color: '#f97316' },
          { name: 'Regular',    price: 2000, quantity: 1500, sold: 592, color: '#22c55e' },
          { name: 'Early Bird', price: 1200, quantity: 300,  sold: 68,  color: '#3b82f6' },
        ],
      },
      {
        id: uuidv4(), orgIdx: 0, cat: 'tech',
        title: 'DevCon East Africa 2025',
        slug:  'devcon-east-africa-2025',
        desc:  'The premier developer conference for East Africa — AI, Web3, DevOps and more.',
        banner: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
        location: 'Sarit Expo Centre, Westlands', locationType: 'physical',
        date: '2025-08-02', startTime: '08:00', endTime: '18:00',
        capacity: 500, sold: 312, status: 'published',
        tags: ['Developer', 'Conference', 'AI'],
        tickets: [
          { name: 'VIP',          price: 8000, quantity: 50,  sold: 43,  color: '#f97316' },
          { name: 'Professional', price: 4500, quantity: 250, sold: 198, color: '#22c55e' },
          { name: 'Student',      price: 1500, quantity: 200, sold: 71,  color: '#3b82f6' },
        ],
      },
      {
        id: uuidv4(), orgIdx: 2, cat: 'music',
        title: 'Afrobeats Night Live',
        slug:  'afrobeats-night-live-2025',
        desc:  'Kenya\'s hottest DJs and live Afrobeats, Amapiano and Gengetone at Carnivore Grounds.',
        banner: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80',
        location: 'Carnivore Grounds, Langata', locationType: 'physical',
        date: '2025-07-20', startTime: '20:00', endTime: '04:00',
        capacity: 3000, sold: 1240, status: 'published',
        tags: ['Afrobeats', 'Nightlife', 'Dance'],
        tickets: [
          { name: 'VIP Table (6 Pax)', price: 30000, quantity: 20,   sold: 14,   color: '#f97316' },
          { name: 'VIP Single',        price: 3500,  quantity: 300,  sold: 198,  color: '#eab308' },
          { name: 'General',           price: 1500,  quantity: 2680, sold: 1028, color: '#22c55e' },
        ],
      },
      {
        id: uuidv4(), orgIdx: 0, cat: 'business',
        title: 'Nairobi Startup Summit',
        slug:  'nairobi-startup-summit-2025',
        desc:  'Connect with 200+ founders, investors and ecosystem builders across East Africa.',
        banner: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&q=80',
        location: 'iHub, Ngong Road', locationType: 'physical',
        date: '2025-09-10', startTime: '09:00', endTime: '17:00',
        capacity: 200, sold: 89, status: 'published',
        tags: ['Startup', 'Investors', 'Networking'],
        tickets: [
          { name: 'Founder Pass', price: 6000, quantity: 100, sold: 45, color: '#f97316' },
          { name: 'General',      price: 2500, quantity: 100, sold: 44, color: '#22c55e' },
        ],
      },
      {
        id: uuidv4(), orgIdx: 2, cat: 'food',
        title: 'Nairobi Food Festival',
        slug:  'nairobi-food-festival-2025',
        desc:  'Sample dishes from 50+ restaurants — cooking demos, wine tasting and a culinary competition.',
        banner: 'https://images.unsplash.com/photo-1555244162-803834f70033?w=800&q=80',
        location: 'Uhuru Park, Nairobi CBD', locationType: 'physical',
        date: '2025-07-27', startTime: '11:00', endTime: '21:00',
        capacity: 5000, sold: 1876, status: 'published',
        tags: ['Food', 'Culture', 'Family'],
        tickets: [
          { name: 'VIP Gourmet',   price: 4500, quantity: 200,  sold: 143,  color: '#f97316' },
          { name: 'General Entry', price: 800,  quantity: 4800, sold: 1733, color: '#22c55e' },
        ],
      },
      {
        id: uuidv4(), orgIdx: 0, cat: 'tech',
        title: 'Crypto & Web3 Kenya Summit',
        slug:  'crypto-web3-kenya-2025',
        desc:  'Deep dive into DeFi, NFTs and the African crypto landscape. Featuring global speakers.',
        banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
        location: 'Virtual Event — Zoom', locationType: 'virtual',
        virtualUrl: 'https://zoom.us/webinar/xxxxx',
        date: '2025-08-18', startTime: '10:00', endTime: '17:00',
        capacity: 1000, sold: 423, status: 'published',
        tags: ['Crypto', 'Web3', 'Blockchain'],
        tickets: [
          { name: 'Premium', price: 2500, quantity: 200, sold: 89,  color: '#f97316' },
          { name: 'Free',    price: 0,    quantity: 800, sold: 334, color: '#22c55e' },
        ],
      },
    ];

    // ticketTypeMap[eventId] = array of { id, name, price, ... }
    const ticketTypeMap = {};

    for (const ev of eventDefs) {
      const orgId = orgIds[ev.orgIdx];

      // Upsert event by slug
      await client.query(
        `INSERT INTO events
           (id, organizer_id, category_id, title, slug, description, banner_url,
            location, location_type, virtual_url,
            event_date, start_time, end_time, capacity, total_sold, status, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (slug)
         DO UPDATE SET
           title        = EXCLUDED.title,
           description  = EXCLUDED.description,
           banner_url   = EXCLUDED.banner_url,
           total_sold   = EXCLUDED.total_sold,
           status       = EXCLUDED.status`,
        [
          ev.id, orgId, catMap[ev.cat], ev.title, ev.slug, ev.desc, ev.banner,
          ev.location, ev.locationType, ev.virtualUrl || null,
          ev.date, ev.startTime, ev.endTime || null,
          ev.capacity, ev.sold, ev.status, ev.tags,
        ]
      );

      // Fetch the real event id (may differ if slug already existed)
      const evRow = await client.query(
        `SELECT id FROM events WHERE slug = $1`, [ev.slug]
      );
      const realEvId = evRow.rows[0].id;

      ticketTypeMap[realEvId] = [];

      for (const tt of ev.tickets) {
        // Upsert ticket types by (event_id, name)
        const ttRes = await client.query(
          `INSERT INTO ticket_types
             (id, event_id, name, price, quantity, sold, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (event_id, name)
           DO UPDATE SET price = EXCLUDED.price, quantity = EXCLUDED.quantity,
                         sold = EXCLUDED.sold, color = EXCLUDED.color
           RETURNING id`,
          [uuidv4(), realEvId, tt.name, tt.price, tt.quantity, tt.sold, tt.color]
        );
        ticketTypeMap[realEvId].push({
          id: ttRes.rows[0].id, ...tt,
        });
      }

      // Keep ev.id pointing to the real DB id for the orders section
      ev.id = realEvId;
    }

    // ─── 7. ORDERS + TICKETS ──────────────────────────────────
    console.log('  → sample orders & tickets...');

    const sampleOrders = [
      { attIdx: 0, evIdx: 0, ttIdx: 0, qty: 2 }, // Alice — Jazz VIP
      { attIdx: 0, evIdx: 1, ttIdx: 1, qty: 1 }, // Alice — DevCon Professional
      { attIdx: 1, evIdx: 0, ttIdx: 1, qty: 3 }, // David — Jazz Regular
      { attIdx: 2, evIdx: 4, ttIdx: 0, qty: 2 }, // Grace — Food Festival VIP
    ];

    for (const so of sampleOrders) {
      const ev        = eventDefs[so.evIdx];
      const evId      = ev.id;
      const ttList    = ticketTypeMap[evId];
      if (!ttList || !ttList[so.ttIdx]) continue; // safety check
      const tt        = ttList[so.ttIdx];
      const attendee  = attendeeIds[so.attIdx];

      const unitPrice    = Number(tt.price);
      const subtotal     = unitPrice * so.qty;
      const commission   = +(subtotal * 0.10).toFixed(2);
      const orderId      = uuidv4();
      const orderRef     = 'ORD-' + slug6();

      // Skip if this exact orderRef somehow already exists (idempotent)
      await client.query(
        `INSERT INTO orders
           (id, order_ref, user_id, event_id,
            attendee_name, attendee_email, attendee_phone,
            subtotal, commission_amt, total, status, payment_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'success','mpesa')
         ON CONFLICT (order_ref) DO NOTHING`,
        [orderId, orderRef, attendee.id, evId,
         attendee.name, attendee.email, attendee.phone,
         subtotal, commission, subtotal]
      );

      // Check if order was actually inserted (may have been skipped by ON CONFLICT)
      const orderCheck = await client.query(
        `SELECT id FROM orders WHERE id = $1`, [orderId]
      );
      if (orderCheck.rows.length === 0) continue;

      // Order item
      const itemId = uuidv4();
      await client.query(
        `INSERT INTO order_items
           (id, order_id, ticket_type_id, quantity, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [itemId, orderId, tt.id, so.qty, unitPrice, subtotal]
      );

      // Transaction record
      const txnRef = 'MPX' + rand(1000000, 9999999);
      await client.query(
        `INSERT INTO transactions
           (id, order_id, txn_ref, amount, method, status)
         VALUES ($1,$2,$3,$4,'mpesa','success')`,
        [uuidv4(), orderId, txnRef, subtotal]
      );

      // Individual ticket rows
      for (let i = 0; i < so.qty; i++) {
        const ticketId  = uuidv4();
        const code      = `EF-${ev.slug.slice(0, 6).toUpperCase()}-${slug6()}`;
        const seatNo    = `${tt.name.slice(0, 3).toUpperCase()}-${100 + i}`;
        const qrData    = JSON.stringify({
          ticket_id: ticketId, code,
          event: ev.title, date: ev.date,
          type: tt.name, attendee: attendee.name,
          order_ref: orderRef,
        });

        await client.query(
          `INSERT INTO tickets
             (id, ticket_code, order_id, order_item_id,
              user_id, event_id, ticket_type_id,
              seat_number, qr_data, is_scanned)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE)`,
          [ticketId, code, orderId, itemId,
           attendee.id, evId, tt.id,
           seatNo, qrData]
        );

        await client.query(
          `INSERT INTO attendees
             (id, event_id, ticket_id, order_id, user_id,
              name, email, phone, ticket_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [uuidv4(), evId, ticketId, orderId, attendee.id,
           attendee.name, attendee.email, attendee.phone, tt.name]
        );
      }
    }

    // ─── 8. PROMO CODES ───────────────────────────────────────
    console.log('  → promo codes...');
    const promos = [
      { code: 'LAUNCH20',  type: 'percent', value: 20,  max: 100 },
      { code: 'EARLYBIRD', type: 'fixed',   value: 500, max: 50  },
      { code: 'VIP50',     type: 'fixed',   value: 50,  max: 20  },
    ];
    for (const p of promos) {
      await client.query(
        `INSERT INTO promo_codes
           (id, code, discount_type, discount_value, max_uses, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (code) DO NOTHING`,
        [uuidv4(), p.code, p.type, p.value, p.max]
      );
    }

    // ─── 9. PLATFORM SETTINGS ─────────────────────────────────
    const settings = [
      ['commission_rate', '10'],
      ['platform_name',   'Sany Adventures'],
      ['support_email',   'support@sanyadventures.com'],
      ['currency',        'KES'],
      ['terms_and_conditions', 'Organizer must provide accurate event information, comply with Kenyan law, and accept platform commission/refund policies.'],
      ['security_enforce_email_verification', 'true'],
      ['security_require_organizer_kyc', 'true'],
      ['security_fraud_auto_block', 'true'],
      ['security_max_orders_per_hour_per_ip', '20'],
      ['trust_show_buyer_protection', 'true'],
      ['trust_show_trust_badges', 'true'],
      ['trust_buyer_protection_text', 'Protected checkout: if payment succeeds and your ticket is not issued, contact support for priority resolution within 24 hours.'],
    ];
    for (const [key, value] of settings) {
      await client.query(
        `INSERT INTO platform_settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    await client.query('COMMIT');

    // ─── SUCCESS ──────────────────────────────────────────────
    console.log('\n✅  Seed completed!\n');
    console.log('────────────────────────────────────────────');
    console.log('  Demo credentials');
    console.log('────────────────────────────────────────────');
    console.log('  ADMIN');
    console.log(`    ${adminEmail}  /  ${process.env.ADMIN_PASSWORD || 'Admin@1234'}`);
    console.log('');
    console.log('  ORGANIZER (approved)');
    console.log('    james@nairobievents.com  /  Organizer@123');
    console.log('');
    console.log('  ORGANIZER (pending)');
    console.log('    amina@techkenya.com  /  Organizer@123');
    console.log('');
    console.log('  USER');
    console.log('    alice@gmail.com  /  User@1234');
    console.log('────────────────────────────────────────────\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌  Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
