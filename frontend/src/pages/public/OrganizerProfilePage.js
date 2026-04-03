// src/pages/public/OrganizerProfilePage.js
// Public-facing organiser profile page — no login required.
// Route: /organisers/:slug
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { organisersAPI } from '../../api/client';
import { fmtDate } from '../../components/ui';
import SanyLogo from '../../components/ui/Logo';

// ── Reusable mini event card ──────────────────────────────────
function MiniEventCard({ event, past = false }) {
  const navigate = useNavigate();
  const minPrice = Number(event.min_price || 0);
  const remaining = event.capacity - event.total_sold;
  const soldOut = remaining <= 0;

  return (
    <div
      className={`event-card organizer-profile-event-card${past ? ' is-past' : ''}`}
      onClick={() => !past && navigate(`/events/${event.id}`)}
    >
      <div className="event-banner">
        {event.banner_url
          ? <img src={event.banner_url} alt={event.title} loading="lazy" />
          : <div className="event-banner-placeholder organizer-profile-event-placeholder">
              <i data-lucide="image" style={{ width: 28, height: 28 }} />
            </div>
        }
        {soldOut && !past && (
          <div className="organizer-profile-event-flag organizer-profile-event-flag-danger">
            SOLD OUT
          </div>
        )}
        {past && (
          <div className="organizer-profile-event-flag organizer-profile-event-flag-muted">
            Past
          </div>
        )}
      </div>
      <div className="event-card-body">
        <div className="event-card-title">{event.title}</div>
        <div className="event-card-meta organizer-profile-event-meta">
          <div className="organizer-profile-inline-meta">
            <i data-lucide="calendar" style={{ width: 12, height: 12 }} />
            {fmtDate(event.event_date)}
          </div>
          <div className="organizer-profile-inline-meta">
            <i data-lucide="map-pin" style={{ width: 12, height: 12 }} />
            {event.location}
          </div>
        </div>
        <div className="event-card-footer organizer-profile-event-footer">
          <div className="organizer-profile-event-count">
            {past
              ? `${event.total_sold} attended`
              : `${remaining} left`
            }
          </div>
          {!past && (
            <span className="organizer-profile-event-price">
              {minPrice === 0 ? 'Free' : `KSh ${minPrice.toLocaleString()}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat pill ────────────────────────────────────────────────
function StatPill({ icon, label, value, color = 'var(--accent)' }) {
  return (
    <div className="organizer-profile-stat">
      <div className="organizer-profile-stat-icon">
        <i data-lucide={icon} style={{ width: 16, height: 16, color }} />
      </div>
      <div className="organizer-profile-stat-copy">
        <div className="organizer-profile-stat-value" style={{ color }}>
          {value}
        </div>
        <div className="organizer-profile-stat-label">
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrganizerProfilePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('upcoming'); // upcoming | past

  useEffect(() => {
    organisersAPI.getProfile(slug)
      .then((r) => {
        setProfile(r.data.data);
        setNotFound(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
        else setNotFound(false);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Inject OG tags for organiser profile sharing
  useEffect(() => {
    if (!profile) return;
    const tags = [
      { property: 'og:type', content: 'profile' },
      { property: 'og:url', content: window.location.href },
      { property: 'og:title', content: `${profile.company_name} — Sany Adventures Organiser` },
      { property: 'og:description', content: profile.description || `Events by ${profile.company_name} on Sany Adventures` },
      { property: 'og:site_name', content: 'Sany Adventures' },
    ];
    document.querySelectorAll('meta[data-og]').forEach((m) => m.remove());
    tags.forEach(({ property, content }) => {
      const meta = document.createElement('meta');
      meta.setAttribute('data-og', '1');
      meta.setAttribute('property', property);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    });
    const prev = document.title;
    document.title = `${profile.company_name} — Sany Adventures`;
    return () => {
      document.querySelectorAll('meta[data-og]').forEach((m) => m.remove());
      document.title = prev;
    };
  }, [profile]);

  if (loading) return (
    <div className="organizer-profile-shell organizer-profile-state-shell">
      <i data-lucide="loader-2" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (notFound) return (
    <div className="organizer-profile-shell organizer-profile-state-shell organizer-profile-state-shell-stack">
      <i data-lucide="user-x" style={{ width: 48, height: 48, color: 'var(--text3)' }} />
      <div className="organizer-profile-state-title">Organiser not found</div>
      <p className="organizer-profile-state-copy">
        This organiser profile doesn't exist or is not yet approved.
      </p>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>
        <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Browse events
      </button>
    </div>
  );

  if (!profile) return (
    <div className="organizer-profile-shell organizer-profile-state-shell organizer-profile-state-shell-stack">
      <i data-lucide="circle-x" style={{ width: 48, height: 48, color: 'var(--danger)' }} />
      <div className="organizer-profile-state-title">Profile unavailable</div>
      <p className="organizer-profile-state-copy">
        This organiser profile could not be loaded right now. Please try again later.
      </p>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>
        <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Browse events
      </button>
    </div>
  );

  const liveEvents = profile.live_events || [];
  const pastEvents = profile.past_events || [];
  const shown = tab === 'upcoming' ? liveEvents : pastEvents;
  const memberYear = profile.member_since
    ? new Date(profile.member_since).getFullYear()
    : '';
  const eventTypes = Array.isArray(profile.event_types)
    ? profile.event_types
    : (profile.event_types ? [profile.event_types] : []);

  return (
    <div className="organizer-profile-shell">
      <nav className="landing-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Back
        </button>
        <SanyLogo size={26} full />
        <Link to="/" className="btn btn-secondary btn-sm">
          <i data-lucide="search" style={{ width: 13, height: 13 }} /> Browse Events
        </Link>
      </nav>

      <div className="organizer-profile-hero">
        <div className="organizer-profile-inner">
          <div className="responsive-header organizer-profile-header">
            <div className="organizer-profile-avatar">
              {profile.company_name?.[0]?.toUpperCase()}
            </div>

            <div className="organizer-profile-main">
              <div className="organizer-profile-title-row">
                <h1 className="organizer-profile-title">
                  {profile.company_name}
                </h1>
                <span className="organizer-profile-verified">
                  <i data-lucide="shield-check" style={{ width: 11, height: 11 }} /> Verified
                </span>
              </div>

              {profile.description && (
                <p className="organizer-profile-description">
                  {profile.description}
                </p>
              )}

              <div className="organizer-profile-meta-row">
                {memberYear && (
                  <span className="organizer-profile-inline-meta">
                    <i data-lucide="calendar" style={{ width: 13, height: 13 }} />
                    Member since {memberYear}
                  </span>
                )}
                {profile.website && (
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank" rel="noreferrer"
                    className="organizer-profile-link"
                  >
                    <i data-lucide="globe" style={{ width: 13, height: 13 }} />
                    Website
                  </a>
                )}
                {profile.social_media && (
                  <span className="organizer-profile-inline-meta">
                    <i data-lucide="instagram" style={{ width: 13, height: 13 }} />
                    {profile.social_media}
                  </span>
                )}
              </div>

              {eventTypes.length > 0 && (
                <div className="organizer-profile-tags">
                  {eventTypes.map((t, i) => (
                    <span key={i} className="badge badge-gray organizer-profile-tag">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="responsive-grid-3 organizer-profile-stats">
            <StatPill icon="calendar" label="Live events" value={liveEvents.length} color="var(--accent)" />
            <StatPill icon="history" label="Past events" value={pastEvents.length} color="var(--info)" />
            <StatPill
              icon="users"
              label="Total attendees"
              value={parseInt(profile.total_attendees || 0, 10).toLocaleString()}
              color="var(--accent2)"
            />
          </div>
        </div>
      </div>

      <div className="landing-section organizer-profile-section">
        <div className="responsive-header organizer-profile-section-head">
          <h2 className="section-title">Events</h2>
          <div className="pill-tabs responsive-pill-tabs">
            <div
              className={`pill-tab ${tab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setTab('upcoming')}
            >
              Upcoming ({liveEvents.length})
            </div>
            <div
              className={`pill-tab ${tab === 'past' ? 'active' : ''}`}
              onClick={() => setTab('past')}
            >
              Past ({pastEvents.length})
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="empty-state organizer-profile-empty-state">
            <div className="empty-icon">
              <i data-lucide={tab === 'upcoming' ? 'calendar-x' : 'history'} style={{ width: 36, height: 36 }} />
            </div>
            <div className="empty-title">
              {tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
            </div>
            <div className="empty-sub">
              {tab === 'upcoming'
                ? 'This organiser has no upcoming events right now. Check back soon.'
                : 'No past events to show yet.'
              }
            </div>
          </div>
        ) : (
          <div className="events-grid">
            {shown.map(ev => (
              <MiniEventCard key={ev.id} event={ev} past={tab === 'past'} />
            ))}
          </div>
        )}
      </div>

      <div className="organizer-profile-footer">
        <div className="organizer-profile-footer-logo">
          <SanyLogo size={24} full />
        </div>
        <p className="organizer-profile-footer-copy">
          Discover adventure events across East Africa
        </p>
      </div>
    </div>
  );
}
