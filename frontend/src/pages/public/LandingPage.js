// src/pages/public/LandingPage.js
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { eventsAPI, categoriesAPI } from '../../api/client';
import { fmtDate } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import SanyLogo from '../../components/ui/Logo';
import ThemeControl from '../../components/ui/ThemeControl';

function EventCard({ event, onClick }) {
  const minPrice  = Number(event.min_price);
  const remaining = event.capacity - event.total_sold;
  const soldOut   = remaining <= 0;
  const pct       = Math.min(Math.round((event.total_sold / event.capacity) * 100), 100);
  return (
    <div className="event-card" onClick={!soldOut ? onClick : undefined}
      style={soldOut ? { opacity: 0.75, cursor: 'default' } : {}}>
      <div className="event-banner">
        {event.banner_url
          ? <img src={event.banner_url} alt={event.title} loading="lazy" />
          : <div className="event-banner-placeholder">
              <i data-lucide="image" style={{ width: 32, height: 32 }} />
            </div>
        }
        <div className="event-category-tag">{event.category}</div>
        {soldOut && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: 'var(--danger)', color: '#fff',
            borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700,
          }}>
            SOLD OUT
          </div>
        )}
      </div>
      <div className="event-card-body">
        <div className="event-card-title">{event.title}</div>
        <div className="event-card-meta">
          <div className="event-meta-row">
            <i data-lucide="calendar" style={{ width: 12, height: 12 }} />
            {fmtDate(event.event_date)} &bull; {event.start_time}
          </div>
          <div className="event-meta-row">
            <i data-lucide={event.location_type === 'virtual' ? 'video' : 'map-pin'} style={{ width: 12, height: 12 }} />
            {event.location}
          </div>
          <div className="event-meta-row">
            <i data-lucide="building-2" style={{ width: 12, height: 12 }} />
            {event.organizer}
          </div>
        </div>
        <div style={{ background: 'var(--surface3)', borderRadius: 4, height: 3, marginBottom: 8 }}>
          <div style={{
            background: soldOut ? 'var(--danger)' : 'var(--accent)',
            height: '100%', borderRadius: 4, width: `${pct}%`,
          }} />
        </div>
        <div className="event-card-footer">
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>From</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: soldOut ? 'var(--text3)' : 'var(--accent)' }}>
              {soldOut ? 'Sold out' : minPrice === 0 ? 'Free' : `KSh ${minPrice.toLocaleString()}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!soldOut && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{remaining} left</span>}
            <button
              className={`btn btn-sm ${soldOut ? 'btn-secondary' : 'btn-primary'}`}
              disabled={soldOut}
              onClick={e => { e.stopPropagation(); if (!soldOut) onClick && onClick(); }}
            >
              {soldOut ? 'Sold out' : 'Buy Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [events, setEvents]     = useState([]);
  const [cats, setCats]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const { user, isAdmin, isOrganizer } = useAuth();
  const navigate = useNavigate();

  const load = useCallback((params = {}) => {
    setLoading(true);
    eventsAPI.list({ status: 'published', limit: 24, ...params })
      .then(r => setEvents(r.data.data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    categoriesAPI.list()
      .then(r => setCats(r.data.data))
      .catch(() => setCats([]));
  }, [load]);

  // ── Homepage OG meta tags ────────────────────────────────────
  // These ensure WhatsApp/Twitter/Facebook show a branded preview
  // card when someone shares the homepage URL.
  useEffect(() => {
    const baseUrl = window.location.origin;
    const tags = [
      { property: 'og:type',        content: 'website' },
      { property: 'og:url',         content: baseUrl },
      { property: 'og:title',       content: 'Sany Adventures — Adventure Ticketing for East Africa' },
      { property: 'og:description', content: 'Discover and book tickets for hiking, trail runs, safaris, outdoor festivals and adventure events across East Africa. Powered by M-PESA.' },
      { property: 'og:image',       content: `${baseUrl}/og-default.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height',content: '630' },
      { property: 'og:site_name',   content: 'Sany Adventures' },
      { name: 'twitter:card',        content: 'summary_large_image' },
      { name: 'twitter:title',       content: 'Sany Adventures — Adventure Ticketing for East Africa' },
      { name: 'twitter:description', content: 'Book tickets for adventure events across East Africa. M-PESA payments.' },
      { name: 'twitter:image',       content: `${baseUrl}/og-default.png` },
    ];
    document.querySelectorAll('meta[data-og]').forEach(m => m.remove());
    tags.forEach(({ property, name, content }) => {
      const meta = document.createElement('meta');
      meta.setAttribute('data-og', '1');
      if (property) meta.setAttribute('property', property);
      if (name)     meta.setAttribute('name', name);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    });
    document.title = 'Sany Adventures — Adventure Ticketing for East Africa';
    return () => {
      document.querySelectorAll('meta[data-og]').forEach(m => m.remove());
    };
  }, []);

  const filterByCategory = (slug) => {
    setCategory(slug);
    load({ search, category: slug || undefined });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    load({ search, category: category || undefined });
  };

  const dashboardLink = isAdmin ? '/admin' : isOrganizer ? '/organizer' : '/dashboard';

  return (
    <div>
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <SanyLogo size={32} full />
        </Link>

        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="search-bar">
            <i data-lucide="search" style={{ width: 14, height: 14, color: 'var(--text3)' }} />
            <input
              type="text" placeholder="Search events…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            <i data-lucide="search" style={{ width: 12, height: 12 }} /> Search
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeControl compact />
          {user ? (
            <Link to={dashboardLink} className="btn btn-secondary btn-sm">
              <i data-lucide="layout-dashboard" style={{ width: 13, height: 13 }} /> Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login"    className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="landing-hero">
        <div className="hero-eyebrow">
          <i data-lucide="map-pin" style={{ width: 11, height: 11 }} /> Events across East Africa
        </div>
        <h1 className="hero-title">Your next experience <span>starts here</span></h1>
        <p className="hero-sub">
          Discover, book and attend the best events — music, tech, food, business and more.
        </p>
        {/* Category chips */}
        <div className="hero-filters">
          <div className={`filter-chip ${category === '' ? 'active' : ''}`} onClick={() => filterByCategory('')}>
            All Events
          </div>
          {cats.map(c => (
            <div
              key={c.id}
              className={`filter-chip ${category === c.slug ? 'active' : ''}`}
              onClick={() => filterByCategory(c.slug)}
            >
              {c.name}
            </div>
          ))}
        </div>
      </div>

      {/* ── Events grid ── */}
      <div className="landing-section">
        <div className="section-header">
          <h2 className="section-title">
            Upcoming events{' '}
            <span style={{ color: 'var(--text2)', fontSize: 14, fontWeight: 400 }}>({events.length})</span>
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
            <i data-lucide="loader-2" style={{ width: 28, height: 28 }} />
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><i data-lucide="calendar-x" style={{ width: 40, height: 40 }} /></div>
            <div className="empty-title">No events found</div>
            <div className="empty-sub">Try a different search term or category</div>
          </div>
        ) : (
          <div className="events-grid">
            {events.map(e => (
              <EventCard key={e.id} event={e} onClick={() => navigate(`/events/${e.id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '20px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <SanyLogo size={28} full />
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          Adventure Ticketing for East Africa
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link to="/customer-care" style={{ fontSize: 12, color: 'var(--text2)' }}>Customer care</Link>
          <Link to="/login"    style={{ fontSize: 12, color: 'var(--text2)' }}>Organizer login</Link>
          <Link to="/register" style={{ fontSize: 12, color: 'var(--text2)' }}>Create account</Link>
        </div>
      </div>
    </div>
  );
}
