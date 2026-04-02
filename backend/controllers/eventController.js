// controllers/eventController.js
const { query, queryOne } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { isDbConnectivityError } = require('../utils/dbErrors');
const { logPlatformEvent, getRequestMeta } = require('../utils/platformLogger');

const slugify = (str) =>
  str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') +
  '-' + Date.now().toString(36);

const toAbsoluteUrl = (req, url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = `${req.protocol}://${req.get('host')}`;
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
};

const normalizeEventRow = (req, row) => ({
  ...row,
  banner_url: toAbsoluteUrl(req, row.banner_url),
});

const getBooleanSetting = async (key, fallback = true) => {
  try {
    const row = await queryOne(`SELECT value FROM platform_settings WHERE key = $1`, [key]);
    if (!row || row.value === undefined || row.value === null) return fallback;
    return String(row.value).toLowerCase() === 'true';
  } catch (_) {
    return fallback;
  }
};

// GET /api/events  — public list with filtering
const getEvents = async (req, res) => {
  const { category, search, date_from, date_to, location_type, status = 'published', page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [`e.status = $${params.push(status)}`];

  if (category)     conditions.push(`c.slug = $${params.push(category)}`);
  if (search)       conditions.push(`(e.title ILIKE $${params.push('%' + search + '%')} OR e.location ILIKE $${params.push('%' + search + '%')})`);
  if (date_from)    conditions.push(`e.event_date >= $${params.push(date_from)}`);
  if (date_to)      conditions.push(`e.event_date <= $${params.push(date_to)}`);
  if (location_type) conditions.push(`e.location_type = $${params.push(location_type)}`);

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [eventsRes, countRes] = await Promise.all([
      query(
        `SELECT e.id, e.title, e.slug, e.banner_url, e.location, e.location_type,
                e.event_date, e.start_time, e.end_time, e.capacity, e.total_sold,
                e.status, e.tags,
                c.name AS category, c.slug AS category_slug,
                o.company_name AS organizer,
                MIN(tt.price) AS min_price, MAX(tt.price) AS max_price
         FROM events e
         LEFT JOIN categories c ON c.id = e.category_id
         LEFT JOIN organizers o ON o.id = e.organizer_id
         LEFT JOIN ticket_types tt ON tt.event_id = e.id AND tt.is_active = TRUE
         ${where}
         GROUP BY e.id, c.name, c.slug, o.company_name
         ORDER BY e.event_date ASC
         LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
        params
      ),
      query(
        `SELECT COUNT(*) FROM events e LEFT JOIN categories c ON c.id = e.category_id ${where}`,
        params.slice(0, params.length - 2) // exclude limit/offset
      ),
    ]);

    return res.json({
      success: true,
      data: eventsRes.rows.map(r => normalizeEventRow(req, r)),
      pagination: {
        total: parseInt(countRes.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(countRes.rows[0].count / limit),
      },
    });
  } catch (err) {
    console.error('getEvents:', err.message);
    if (isDbConnectivityError(err)) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Please try again shortly.' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/events/:idOrSlug  — single event with ticket types
const getEvent = async (req, res) => {
  const { idOrSlug } = req.params;
  try {
    const event = await queryOne(
      `SELECT e.*, c.name AS category, c.slug AS category_slug,
              o.id AS organizer_id, o.company_name AS organizer_name,
              o.slug AS organizer_slug, o.user_id AS organizer_user_id,
              u.name AS organizer_contact_name, u.email AS organizer_email
       FROM events e
       LEFT JOIN categories c ON c.id = e.category_id
       LEFT JOIN organizers o ON o.id = e.organizer_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE e.id::text = $1 OR e.slug = $1`,
      [idOrSlug]
    );
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    const isOwner = req.user?.id === event.organizer_user_id;
    const isAdmin = req.user?.role === 'admin';
    const isPubliclyViewable = event.status === 'published';

    if (!isPubliclyViewable && !isOwner && !isAdmin) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const canViewInactiveTickets =
      isAdmin || isOwner;

    const tickets = await query(
      `SELECT id, name, price, quantity, sold, color, description, sale_start, sale_end, is_active
       FROM ticket_types
       WHERE event_id = $1
         AND ($2::boolean = TRUE OR is_active = TRUE)
       ORDER BY price DESC`,
      [event.id, canViewInactiveTickets]
    );

    return res.json({
      success: true,
      data: { ...normalizeEventRow(req, event), ticket_types: tickets.rows },
    });
  } catch (err) {
    console.error('getEvent:', err.message);
    if (isDbConnectivityError(err)) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Please try again shortly.' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/events  — organizer creates event
const createEvent = async (req, res) => {
  const {
    title, description, category_id, location, location_type, virtual_url,
    event_date, start_time, end_time, capacity, banner_url, tags, ticket_types,
  } = req.body;

  if (!title || !event_date || !start_time || !location) {
    return res.status(400).json({ success: false, message: 'title, event_date, start_time, location are required' });
  }

  try {
    // Get organizer id for this user
    const org = await queryOne(`SELECT id FROM organizers WHERE user_id = $1`, [req.user.id]);
    if (!org) return res.status(403).json({ success: false, message: 'Organizer profile not found' });
    if (req.user.role !== 'admin') {
      const orgFull = await queryOne(`SELECT status FROM organizers WHERE id = $1`, [org.id]);
      if (orgFull.status !== 'approved') {
        return res.status(403).json({ success: false, message: 'Your account is not yet approved' });
      }
    }

    const eventId = uuidv4();
    const slug = slugify(title);
    const initialStatus = req.user.role === 'admin' ? 'published' : 'draft';

    await query(
      `INSERT INTO events
         (id, organizer_id, category_id, title, slug, description, banner_url,
          location, location_type, virtual_url, event_date, start_time, end_time, capacity, tags, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [eventId, org.id, category_id || null, title, slug, description || null,
       banner_url || null, location, location_type || 'physical', virtual_url || null,
       event_date, start_time, end_time || null, capacity || 100, tags || [], initialStatus]
    );

    // Insert ticket types
    if (Array.isArray(ticket_types) && ticket_types.length > 0) {
      for (const tt of ticket_types) {
        await query(
          `INSERT INTO ticket_types (id, event_id, name, price, quantity, color, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), eventId, tt.name, tt.price || 0, tt.quantity || 0, tt.color || '#22c55e', tt.description || null]
        );
      }
    }

    const created = await queryOne(`SELECT * FROM events WHERE id = $1`, [eventId]);
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'event',
      eventType: 'event_created',
      entityType: 'event',
      entityId: eventId,
      summary: `Event "${title}" created`,
      payload: {
        title,
        status: created.status,
        organizer_id: org.id,
        ticket_type_count: Array.isArray(ticket_types) ? ticket_types.length : 0,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.status(201).json({
      success: true,
      message: initialStatus === 'published'
        ? 'Event created'
        : 'Event saved as draft',
      data: normalizeEventRow(req, created),
    });
  } catch (err) {
    console.error('createEvent:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/events/:id  — organizer updates their event
const updateEvent = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const event = await queryOne(`SELECT * FROM events e JOIN organizers o ON o.id = e.organizer_id WHERE e.id = $1`, [id]);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const fields = ['title','description','location','location_type','virtual_url','event_date',
                    'start_time','end_time','capacity','banner_url','category_id','tags'];
    const setClauses = [];
    const params = [];

    fields.forEach(f => {
      if (updates[f] !== undefined) {
        setClauses.push(`${f} = $${params.push(updates[f])}`);
      }
    });

    if (!setClauses.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    await query(`UPDATE events SET ${setClauses.join(',')} WHERE id = $${params.length}`, params);

    // Update ticket types if provided
    if (Array.isArray(updates.ticket_types)) {
      const existing = await query(
        `SELECT id, name, sold
         FROM ticket_types
         WHERE event_id = $1`,
        [id]
      );
      const existingById = new Map(existing.rows.map((row) => [row.id, row]));
      const seenIds = new Set();

      for (const tt of updates.ticket_types) {
        const ticketTypeId = tt.id && existingById.has(tt.id) ? tt.id : null;
        const quantity = Number(tt.quantity || 0);
        const price = Number(tt.price || 0);

        if (ticketTypeId) {
          const current = existingById.get(ticketTypeId);
          if (quantity < Number(current.sold || 0)) {
            return res.status(400).json({
              success: false,
              message: `Quantity for "${current.name}" cannot be lower than tickets already sold`,
            });
          }
          await query(
            `UPDATE ticket_types
             SET name = $1,
                 price = $2,
                 quantity = $3,
                 color = $4,
                 description = $5,
                 is_active = TRUE
             WHERE id = $6`,
            [
              tt.name,
              price,
              quantity,
              tt.color || '#22c55e',
              tt.description || null,
              ticketTypeId,
            ]
          );
          seenIds.add(ticketTypeId);
        } else {
          await query(
            `INSERT INTO ticket_types
               (id, event_id, name, price, quantity, color, description, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
            [uuidv4(), id, tt.name, price, quantity, tt.color || '#22c55e', tt.description || null]
          );
        }
      }

      for (const current of existing.rows) {
        if (!seenIds.has(current.id)) {
          await query(
            `UPDATE ticket_types
             SET is_active = FALSE
             WHERE id = $1`,
            [current.id]
          );
        }
      }
    }

    const updated = await queryOne(`SELECT * FROM events WHERE id = $1`, [id]);
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'event',
      eventType: 'event_updated',
      entityType: 'event',
      entityId: id,
      summary: `Event "${updated.title}" updated`,
      payload: {
        updated_fields: Object.keys(updates || {}),
        ticket_types_updated: Array.isArray(updates.ticket_types),
        status: updated.status,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({
      success: true,
      message: 'Event updated',
      data: normalizeEventRow(req, updated),
    });
  } catch (err) {
    console.error('updateEvent:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/events/:id
const deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const event = await queryOne(
      `SELECT e.id, e.title, o.user_id FROM events e JOIN organizers o ON o.id = e.organizer_id WHERE e.id = $1`, [id]
    );
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await query(`DELETE FROM events WHERE id = $1`, [id]);
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'event',
      eventType: 'event_deleted',
      entityType: 'event',
      entityId: id,
      summary: `Event "${event.title}" deleted`,
      payload: {},
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    console.error('deleteEvent:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/events/organizer/mine  — organizer's own events
const getMyEvents = async (req, res) => {
  try {
    const org = await queryOne(`SELECT id FROM organizers WHERE user_id = $1`, [req.user.id]);
    if (!org && req.user.role !== 'admin') {
      return res.status(404).json({ success: false, message: 'Organizer not found' });
    }
    // Parameterised query — never interpolate IDs into SQL strings
    const isAdmin = req.user.role === 'admin';
    const events = await query(
      `SELECT e.*, c.name AS category,
              COALESCE(SUM(tt.price * tt.sold), 0) AS revenue,
              COUNT(DISTINCT tt.id) AS ticket_type_count
       FROM events e
       LEFT JOIN categories c ON c.id = e.category_id
       LEFT JOIN ticket_types tt ON tt.event_id = e.id
       ${isAdmin ? '' : 'WHERE e.organizer_id = $1'}
       GROUP BY e.id, c.name
       ORDER BY e.created_at DESC`,
      isAdmin ? [] : [org.id]
    );
    return res.json({ success: true, data: events.rows.map(r => normalizeEventRow(req, r)) });
  } catch (err) {
    console.error('getMyEvents:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// PATCH /api/admin/events/:id/status — admin publish/unpublish/feature
const updateEventStatus = async (req, res) => {
  const { id } = req.params;
  const { status, is_featured } = req.body;

  const allowed = ['draft', 'published', 'cancelled', 'completed'];
  if (status !== undefined && !allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    const event = await queryOne(
      `SELECT e.id, e.title, e.status AS previous_status, e.is_featured AS previous_is_featured, e.organizer_id,
              o.user_id AS organizer_user_id,
              o.id_number, o.physical_address, o.terms_agreed
       FROM events e
       JOIN organizers o ON o.id = e.organizer_id
       WHERE e.id = $1`,
      [id]
    );
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = event.organizer_user_id === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (is_featured !== undefined && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admins can mark events as featured' });
    }
    if (!isAdmin && status === 'completed') {
      return res.status(403).json({ success: false, message: 'Only admins can mark events as completed' });
    }

    if (status === 'published') {
      const enforceKyc = await getBooleanSetting('security_require_organizer_kyc', true);
      if (enforceKyc) {
        const hasKyc = Boolean(event.id_number && event.physical_address && event.terms_agreed);
        if (!hasKyc) {
          return res.status(403).json({
            success: false,
            message: 'Organizer KYC is incomplete. Complete ID, address, and terms agreement before publishing.',
          });
        }
      }
    }

    const sets   = [];
    const params = [];

    if (status !== undefined) {
      sets.push(`status = $${params.push(status)}`);
    }
    if (is_featured !== undefined) {
      sets.push(`is_featured = $${params.push(!!is_featured)}`);
    }
    if (!sets.length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }
    sets.push('updated_at = NOW()');
    params.push(id);

    const updated = await queryOne(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, status, is_featured`,
      params
    );
    await logPlatformEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      domain: 'event',
      eventType: 'event_status_updated',
      entityType: 'event',
      entityId: id,
      summary: `Event "${event.title}" admin status updated`,
      payload: {
        previous_status: event.previous_status,
        new_status: updated.status,
        previous_is_featured: event.previous_is_featured,
        new_is_featured: updated.is_featured,
      },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Event updated', data: updated });
  } catch (err) {
    console.error('updateEventStatus:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getEvents, getEvent, createEvent, updateEvent, updateEventStatus, deleteEvent, getMyEvents };
