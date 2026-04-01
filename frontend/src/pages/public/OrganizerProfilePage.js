// src/pages/public/OrganizerProfilePage.js
// Public-facing organiser profile page — no login required.
// Route: /organisers/:slug
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { organisersAPI } from '../../api/client';
import { fmtDate, fmtCurrency } from '../../components/ui';
import SanyLogo from '../../components/ui/Logo';

// ── Reusable mini event card ──────────────────────────────────
function MiniEventCard({ event, past = false }) {
  const navigate  = useNavigate();
  const minPrice  = Number(event.min_price || 0);
  const remaining = event.capacity - event.total_sold;
  const soldOut   = remaining <= 0;

  return (
    <div
      className="event-card"
      onClick={() => !past && navigate(`/events/${event.id}`)}
      style={{ cursor: past ? 'default' : 'pointer', opacity: past ? 0.75 : 1 }}
    >
      <div className="event-banner">
        {event.banner_url
          ? <img src={event.banner_url} alt={event.title} loading="lazy" />
          : <div className="event-banner-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <i data-lucide="image" style={{ width: 28, height: 28 }} />
            </div>
        }
        {soldOut && !past && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'var(--danger)', color: '#fff', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
            SOLD OUT
          </div>
        )}
        {past && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#aaa', borderRadius: 5, padding: '2px 8px', fontSize: 11 }}>
            Past
          </div>
        )}
      </div>
      <div className="event-card-body">
        <div className="event-card-title">{event.title}</div>
        <div className="event-card-meta">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
            <i data-lucide="calendar" style={{ width: 12, height: 12 }} />
            {fmtDate(event.event_date)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
            <i data-lucide="map-pin" style={{ width: 12, height: 12 }} />
            {event.location}
          </div>
        </div>
        <div className="event-card-footer">
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {past
              ? `${event.total_sold} attended`
              : `${remaining} left`
            }
          </div>
          {!past && (
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>
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
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            10,
      background:     'var(--surface2)',
      border:         '1px solid var(--border)',
      borderRadius:   10,
      padding:        '12px 16px',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--surface3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <i data-lucide={icon} style={{ width: 16, height: 16, color }} />
      </div>
      <div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, color, lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrganizerProfilePage() {
  const { slug }                    = useParams();
  const navigate                    = useNavigate();
  const [profile, setProfile]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [tab, setTab]               = useState('upcoming'); // upcoming | past

  useEffect(() => {
    organisersAPI.getProfile(slug)
      .then(r => setProfile(r.data.data))
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Inject OG tags for organiser profile sharing
  useEffect(() => {
    if (!profile) return;
    const tags = [
      { property: 'og:type',        content: 'profile' },
      { property: 'og:url',         content: window.location.href },
      { property: 'og:title',       content: `${profile.company_name} — Sany Adventures Organiser` },
      { property: 'og:description', content: profile.description || `Events by ${profile.company_name} on Sany Adventures` },
      { property: 'og:site_name',   content: 'Sany Adventures' },
    ];
    document.querySelectorAll('meta[data-og]').forEach(m => m.remove());
    tags.forEach(({ property, content }) => {
      const meta = document.createElement('meta');
      meta.setAttribute('data-og', '1');
      meta.setAttribute('property', property);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    });
    const prev   = document.title;
    document.title = `${profile.company_name} — Sany Adventures`;
    return () => {
      document.querySelectorAll('meta[data-og]').forEach(m => m.remove());
      document.title = prev;
    };
  }, [profile]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <i data-lucide="user-x" style={{ width: 48, height: 48, color: 'var(--text3)' }} />
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20 }}>Organiser not found</div>
      <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center' }}>
        This organiser profile doesn't exist or is not yet approved.
      </p>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>
        <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Browse events
      </button>
    </div>
  );

  const liveEvents = profile.live_events  || [];
  const pastEvents = profile.past_events  || [];
  const shown      = tab === 'upcoming' ? liveEvents : pastEvents;
  const memberYear = profile.member_since
    ? new Date(profile.member_since).getFullYear()
    : '';
  const eventTypes = Array.isArray(profile.event_types)
    ? profile.event_types
    : (profile.event_types ? [profile.event_types] : []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Top nav ── */}
      <nav className="landing-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Back
        </button>
        <SanyLogo size={26} full />
        <Link to="/" className="btn btn-secondary btn-sm">
          <i data-lucide="search" style={{ width: 13, height: 13 }} /> Browse Events
        </Link>
      </nav>

      {/* ── Profile hero ── */}
      <div style={{
        background:   'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding:      '40px 24px 32px',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>

            {/* Avatar */}
            <div style={{
              width: 80, height: 80, borderRadius: 16, flexShrink: 0,
              background: 'var(--accent-dim)',
              border: '2px solid var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Syne, sans-serif', fontWeight: 900,
              fontSize: 32, color: 'var(--accent)',
            }}>
              {profile.company_name?.[0]?.toUpperCase()}
            </div>

            {/* Name + info */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, margin: 0 }}>
                  {profile.company_name}
                </h1>
                <span style={{
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  border: '1px solid rgba(201,162,39,0.3)',
                  borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <i data-lucide="shield-check" style={{ width: 11, height: 11 }} /> Verified
                </span>
              </div>

              {profile.description && (
                <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, margin: '0 0 12px 0', maxWidth: 600 }}>
                  {profile.description}
                </p>
              )}

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text2)' }}>
                {memberYear && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i data-lucide="calendar" style={{ width: 13, height: 13 }} />
                    Member since {memberYear}
                  </span>
                )}
                {profile.website && (
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    <i data-lucide="globe" style={{ width: 13, height: 13 }} />
                    Website
                  </a>
                )}
                {profile.social_media && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i data-lucide="instagram" style={{ width: 13, height: 13 }} />
                    {profile.social_media}
                  </span>
                )}
              </div>

              {eventTypes.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {eventTypes.map((t, i) => (
                    <span key={i} className="badge badge-gray" style={{ fontSize: 11 }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginTop: 28,
          }}>
            <StatPill icon="calendar"   label="Live events"     value={liveEvents.length}  color="var(--accent)" />
            <StatPill icon="history"    label="Past events"     value={pastEvents.length}   color="var(--info)" />
            <StatPill icon="users"      label="Total attendees" value={parseInt(profile.total_attendees || 0).toLocaleString()}    color="var(--accent2)" />
          </div>
        </div>
      </div>

      {/* ── Events section ── */}
      <div className="landing-section" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 className="section-title">Events</h2>
          <div className="pill-tabs">
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
          <div className="empty-state" style={{ padding: '48px 24px' }}>
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

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', marginTop: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <SanyLogo size={24} full />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
          Discover adventure events across East Africa
        </p>
      </div>
    </div>
  );
}
