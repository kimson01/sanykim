// controllers/organizerProfileController.js
// Public organiser profile — no authentication required.
const { queryOne, query } = require('../config/db');

const slugify = (str) =>
  str.toLowerCase().trim()
     .replace(/[^a-z0-9\s-]/g, '')
     .replace(/\s+/g, '-')
     .replace(/-+/g, '-');

// ── GET /api/organisers/:slug ─────────────────────────────────
// Public profile page for an organiser — their bio, events, and stats.
const getOrgProfile = async (req, res) => {
  const { slug } = req.params;

  try {
    // Find organiser by slug
    const org = await queryOne(
      `SELECT o.id, o.company_name, o.slug, o.description, o.website,
              o.logo_url, o.social_media, o.event_types,
              o.total_revenue, o.commission,
              u.name AS contact_name, u.created_at AS member_since,
              COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'published') AS live_events,
              COUNT(DISTINCT e.id) FILTER (WHERE e.event_date < NOW())    AS past_events,
              COALESCE(SUM(e.total_sold) FILTER (WHERE e.status = 'published'), 0) AS total_attendees
       FROM organizers o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN events e ON e.organizer_id = o.id
       WHERE o.slug = $1 AND o.status = 'approved'
       GROUP BY o.id, u.name, u.created_at`,
      [slug]
    );

    if (!org) {
      return res.status(404).json({ success: false, message: 'Organiser not found' });
    }

    // Current live events
    const liveEvents = await query(
      `SELECT e.id, e.title, e.slug, e.banner_url, e.event_date,
              e.start_time, e.location, e.location_type,
              e.capacity, e.total_sold,
              MIN(tt.price) AS min_price
       FROM events e
       LEFT JOIN ticket_types tt ON tt.event_id = e.id AND tt.is_active = TRUE
       WHERE e.organizer_id = $1 AND e.status = 'published'
         AND e.event_date >= CURRENT_DATE
       GROUP BY e.id
       ORDER BY e.event_date ASC
       LIMIT 12`,
      [org.id]
    );

    // Past events (last 6)
    const pastEvents = await query(
      `SELECT e.id, e.title, e.slug, e.banner_url, e.event_date,
              e.location, e.total_sold
       FROM events e
       WHERE e.organizer_id = $1
         AND e.event_date < CURRENT_DATE
       ORDER BY e.event_date DESC
       LIMIT 6`,
      [org.id]
    );

    return res.json({
      success: true,
      data: {
        ...org,
        live_events:      liveEvents.rows,
        past_events:      pastEvents.rows,
      },
    });
  } catch (err) {
    console.error('getOrgProfile:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Auto-generate slug when organiser is approved ─────────────
// Called from updateOrganizerStatus in adminController.
const generateOrgSlug = async (orgId, companyName) => {
  const base = slugify(companyName);
  let slug    = base;
  let suffix  = 0;

  while (true) {
    const existing = await queryOne(
      `SELECT id FROM organizers WHERE slug = $1`, [slug]
    );
    if (!existing) break;
    suffix++;
    slug = `${base}-${suffix}`;
  }

  await query(
    `UPDATE organizers SET slug = $1 WHERE id = $2`,
    [slug, orgId]
  );

  return slug;
};

module.exports = { getOrgProfile, generateOrgSlug };
