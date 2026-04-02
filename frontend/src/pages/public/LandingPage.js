// src/pages/public/LandingPage.js
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoriesAPI, eventsAPI, settingsAPI } from '../../api/client';
import { fmtDate } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import SanyLogo from '../../components/ui/Logo';
import ThemeControl from '../../components/ui/ThemeControl';

const DEFAULT_CMS = {
  platform_name: 'Sany Adventures',
  cms_home_eyebrow: 'Events across East Africa',
  cms_home_title: 'Your next experience',
  cms_home_title_highlight: 'starts here',
  cms_home_subtitle: 'Discover, book and attend the best events — music, tech, food, business and more.',
  cms_home_primary_cta_label: 'Explore Events',
  cms_home_primary_cta_url: '/',
  cms_home_secondary_cta_label: 'Become an Organizer',
  cms_home_secondary_cta_url: '/register',
  cms_footer_tagline: 'Adventure Ticketing for East Africa',
};

function CmsLinkButton({ to, label, className }) {
  if (!label || !to) return null;
  const isInternal = /^\/(?!\/)/.test(to);
  if (isInternal) {
    return <Link to={to} className={className}>{label}</Link>;
  }
  return (
    <a href={to} className={className} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function EventCard({ event, onClick }) {
  const minPrice = Number(event.min_price);
  const remaining = Math.max((event.capacity || 0) - (event.total_sold || 0), 0);
  const soldOut = remaining <= 0;

  return (
    <article
      className={`landing-event-card${soldOut ? ' is-sold-out' : ''}`}
      onClick={!soldOut ? onClick : undefined}
    >
      <div className="landing-event-media">
        {event.banner_url ? (
          <img src={event.banner_url} alt={event.title} loading="lazy" />
        ) : (
          <div className="landing-event-placeholder">
            <i data-lucide="image" style={{ width: 30, height: 30 }} />
          </div>
        )}

        <div className="landing-event-topline">
          <span className="landing-event-chip">{event.category}</span>
          {soldOut && <span className="landing-event-chip landing-event-chip-danger">Sold out</span>}
        </div>
      </div>

      <div className="landing-event-body">
        <div className="landing-event-copy">
          <h3 className="landing-event-title">{event.title}</h3>
          <div className="landing-event-meta">
            <span><i data-lucide="calendar" style={{ width: 12, height: 12 }} /> {fmtDate(event.event_date)} • {event.start_time}</span>
            <span><i data-lucide={event.location_type === 'virtual' ? 'video' : 'map-pin'} style={{ width: 12, height: 12 }} /> {event.location}</span>
            <span><i data-lucide="building-2" style={{ width: 12, height: 12 }} /> {event.organizer}</span>
          </div>
        </div>

        <div className="landing-event-footer">
          <div>
            <div className="landing-event-label">Entry</div>
            <div className="landing-event-price">
              {soldOut ? 'Sold out' : minPrice === 0 ? 'Free' : `KSh ${minPrice.toLocaleString()}`}
            </div>
          </div>

          <div className="landing-event-cta">
            {!soldOut && <span className="landing-event-availability">{remaining} left</span>}
            <button
              className={`btn btn-sm ${soldOut ? 'btn-secondary' : 'btn-primary'}`}
              disabled={soldOut}
              onClick={(e) => {
                e.stopPropagation();
                if (!soldOut && onClick) onClick();
              }}
            >
              {soldOut ? 'Unavailable' : 'View event'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function LandingPage() {
  const [events, setEvents] = useState([]);
  const [cats, setCats] = useState([]);
  const [cms, setCms] = useState(DEFAULT_CMS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const { user, isAdmin, isOrganizer } = useAuth();
  const navigate = useNavigate();

  const load = useCallback((params = {}) => {
    setLoading(true);
    eventsAPI.list({ status: 'published', limit: 24, ...params })
      .then((response) => setEvents(response.data.data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    categoriesAPI.list()
      .then((response) => setCats(response.data.data))
      .catch(() => setCats([]));
    settingsAPI.public()
      .then((response) => setCms((current) => ({ ...current, ...(response.data.data || {}) })))
      .catch(() => setCms(DEFAULT_CMS));
  }, [load]);

  useEffect(() => {
    const baseUrl = window.location.origin;
    const brand = cms.platform_name || DEFAULT_CMS.platform_name;
    const heroTitle =
      [cms.cms_home_title, cms.cms_home_title_highlight].filter(Boolean).join(' ').trim()
      || `${brand} events`;
    const heroDescription = cms.cms_home_subtitle || DEFAULT_CMS.cms_home_subtitle;
    const tags = [
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: baseUrl },
      { property: 'og:title', content: `${brand} — ${heroTitle}` },
      { property: 'og:description', content: heroDescription },
      { property: 'og:image', content: `${baseUrl}/og-default.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:site_name', content: brand },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: `${brand} — ${heroTitle}` },
      { name: 'twitter:description', content: heroDescription },
      { name: 'twitter:image', content: `${baseUrl}/og-default.png` },
    ];

    document.querySelectorAll('meta[data-og]').forEach((meta) => meta.remove());
    tags.forEach(({ property, name, content }) => {
      const meta = document.createElement('meta');
      meta.setAttribute('data-og', '1');
      if (property) meta.setAttribute('property', property);
      if (name) meta.setAttribute('name', name);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    });
    document.title = `${brand} — ${heroTitle}`;

    return () => {
      document.querySelectorAll('meta[data-og]').forEach((meta) => meta.remove());
    };
  }, [cms]);

  const filterByCategory = (slug) => {
    setCategory(slug);
    load({ search, category: slug || undefined });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    load({ search, category: category || undefined });
  };

  const dashboardLink = isAdmin ? '/admin' : isOrganizer ? '/organizer' : '/dashboard';
  const featured = events.slice(0, 3);

  return (
    <div className="landing-shell">
      <nav className="landing-nav landing-nav-rich">
        <Link to="/" className="landing-brandmark">
          <SanyLogo size={32} full />
        </Link>

        <form onSubmit={handleSearch} className="landing-nav-search">
          <div className="search-bar landing-search-bar">
            <i data-lucide="search" style={{ width: 14, height: 14, color: 'var(--text3)' }} />
            <input
              type="text"
              placeholder="Search by city, theme, or event"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            Search
          </button>
        </form>

        <div className="landing-nav-actions">
          <ThemeControl compact />
          {user ? (
            <Link to={dashboardLink} className="btn btn-secondary btn-sm">
              <i data-lucide="layout-dashboard" style={{ width: 13, height: 13 }} /> Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      <section className="landing-stage">
        <div className="landing-stage-copy">
          <div className="hero-eyebrow landing-stage-eyebrow">
            <i data-lucide="map-pin" style={{ width: 11, height: 11 }} /> {cms.cms_home_eyebrow || DEFAULT_CMS.cms_home_eyebrow}
          </div>
          <h1 className="landing-stage-title">
            {cms.cms_home_title || DEFAULT_CMS.cms_home_title}{' '}
            <span>{cms.cms_home_title_highlight || DEFAULT_CMS.cms_home_title_highlight}</span>
          </h1>
          <p className="landing-stage-subtitle">
            {cms.cms_home_subtitle || DEFAULT_CMS.cms_home_subtitle}
          </p>

          <div className="landing-stage-actions">
            <CmsLinkButton
              to={cms.cms_home_primary_cta_url || DEFAULT_CMS.cms_home_primary_cta_url}
              label={cms.cms_home_primary_cta_label || DEFAULT_CMS.cms_home_primary_cta_label}
              className="btn btn-primary btn-lg"
            />
            <CmsLinkButton
              to={cms.cms_home_secondary_cta_url || DEFAULT_CMS.cms_home_secondary_cta_url}
              label={cms.cms_home_secondary_cta_label || DEFAULT_CMS.cms_home_secondary_cta_label}
              className="btn btn-secondary btn-lg"
            />
          </div>

          <div className="landing-stage-metrics">
            <div className="landing-stage-metric">
              <span>Live picks</span>
              <strong>{events.length}</strong>
            </div>
            <div className="landing-stage-metric">
              <span>Categories</span>
              <strong>{cats.length || '—'}</strong>
            </div>
            <div className="landing-stage-metric">
              <span>Audience</span>
              <strong>East Africa</strong>
            </div>
          </div>
        </div>

        <aside className="landing-stage-side">
          <div className="landing-stage-panel">
            <div className="landing-stage-panel-kicker">Right now</div>
            <h2 className="landing-stage-panel-title">A quick feel for what people can book today.</h2>

            {featured.length === 0 ? (
              <div className="landing-stage-empty">Fresh events will appear here once they are published.</div>
            ) : (
              <div className="landing-stage-featured-list">
                {featured.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="landing-stage-featured-item"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <div>
                      <strong>{event.title}</strong>
                      <span>{fmtDate(event.event_date)} • {event.location}</span>
                    </div>
                    <em>{Number(event.min_price) === 0 ? 'Free' : `KSh ${Number(event.min_price).toLocaleString()}`}</em>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="landing-discovery">
        <div className="landing-discovery-head">
          <div>
            <div className="landing-discovery-kicker">Discover</div>
            <h2 className="landing-discovery-title">Browse experiences with a little more intent.</h2>
          </div>
          <p className="landing-discovery-copy">
            Filter by mood, search by place, and move directly into booking when something feels right.
          </p>
        </div>

        <div className="landing-filter-strip">
          <button
            type="button"
            className={`filter-chip ${category === '' ? 'active' : ''}`}
            onClick={() => filterByCategory('')}
          >
            All Events
          </button>
          {cats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`filter-chip ${category === cat.slug ? 'active' : ''}`}
              onClick={() => filterByCategory(cat.slug)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="landing-section">
          <div className="section-header landing-events-head">
            <h2 className="section-title">
              Upcoming events <span className="landing-events-count">({events.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="landing-events-state">
              <i data-lucide="loader-2" style={{ width: 28, height: 28 }} />
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state landing-events-empty">
              <div className="empty-icon"><i data-lucide="calendar-x" style={{ width: 40, height: 40 }} /></div>
              <div className="empty-title">No events found</div>
              <div className="empty-sub">Try a different search term or category.</div>
            </div>
          ) : (
            <div className="events-grid landing-events-grid">
              {events.map((event) => (
                <EventCard key={event.id} event={event} onClick={() => navigate(`/events/${event.id}`)} />
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <SanyLogo size={28} full />
          <p>{cms.cms_footer_tagline || DEFAULT_CMS.cms_footer_tagline}</p>
        </div>

        <div className="landing-footer-links">
          <Link to="/customer-care">Customer care</Link>
          <Link to="/login">Organizer login</Link>
          <Link to="/register">Create account</Link>
        </div>
      </footer>
    </div>
  );
}
