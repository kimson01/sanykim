// src/pages/user/UserDashboard.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI } from '../../api/client';
import { fmtCurrency, fmtDate, Badge, useToast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function CountdownBadge({ dateStr }) {
  const d = daysUntil(dateStr);
  if (d < 0) return null;
  if (d === 0) return <span className="account-chip account-chip-danger">Today</span>;
  if (d === 1) return <span className="account-chip account-chip-warning">Tomorrow</span>;
  if (d <= 7)  return <span className="account-chip account-chip-accent">{d} days</span>;
  return null;
}

// ── Inline metric (no card border) ───────────────────────────
function Metric({ label, value, sub, color = 'var(--text)', icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
        <i data-lucide={icon} style={{ width: 13, height: 13, color }} />
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function UserDashboard() {
  const { user }     = useAuth();
  const [orders, setOrders]   = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('upcoming'); // upcoming | past
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([ordersAPI.myOrders(), ordersAPI.myTickets()])
      .then(([oRes, tRes]) => {
        setOrders(oRes.data.data);
        setTickets(tRes.data.data);
      })
      .catch((err) => {
        setOrders([]);
        setTickets([]);
        toast(err.response?.data?.message || 'Failed to load dashboard data', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  const now = new Date();
  const upcoming = tickets.filter((t) => new Date(t.event_date) >= now && !t.is_scanned && !t.is_voided);
  const past = tickets.filter((t) => new Date(t.event_date) < now || t.is_scanned || t.is_voided);
  const shown    = tab === 'upcoming' ? upcoming : past;
  const totalSpent = orders.filter(o => o.status === 'success')
                           .reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="account-shell">

      {/* Greeting */}
      <div className="account-hero">
        <div>
          <h1 className="account-title">Hello, {user?.name?.split(' ')[0]}</h1>
          <div className="account-subtitle">Your tickets, orders, and upcoming plans.</div>
        </div>
        <Link to="/" className="btn btn-primary btn-sm">
          <i data-lucide="search" style={{ width: 13, height: 13 }} /> Browse Events
        </Link>
      </div>

      {/* Metrics strip — single bordered row, no individual cards */}
      <div className="responsive-stats-strip" style={{
        gap: 0,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {[
          { label: 'My Tickets',      value: tickets.length,          icon: 'ticket',      color: 'var(--accent)',  sub: `${upcoming.length} upcoming` },
          { label: 'Upcoming',        value: upcoming.length,          icon: 'calendar',    color: 'var(--info)',    sub: upcoming.length > 0 ? `Next: ${fmtDate(upcoming[0]?.event_date)}` : 'None scheduled' },
          { label: 'Events attended', value: past.length,              icon: 'check-circle',color: 'var(--accent2)', sub: `${orders.length} orders total` },
          { label: 'Total spent',     value: fmtCurrency(totalSpent),  icon: 'trending-up', color: 'var(--accent)',  sub: `${orders.filter(o => o.status === 'success').length} successful` },
        ].map((m, i) => (
          <div key={i} style={{ borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <Metric {...m} />
          </div>
        ))}
      </div>

      {/* Tickets section with tab toggle */}
      <div>
        <div className="responsive-header" style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700 }}>My Tickets</h2>
          <div className="pill-tabs responsive-pill-tabs">
            <div className={`pill-tab ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => setTab('upcoming')}>
              Upcoming ({upcoming.length})
            </div>
            <div className={`pill-tab ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>
              Past ({past.length})
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="account-empty">
            <i data-lucide={tab === 'upcoming' ? 'calendar-x' : 'history'} style={{ width: 32, height: 32, color: 'var(--text3)', marginBottom: 12 }} />
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>
              {tab === 'upcoming' ? 'No upcoming events' : 'No past events yet'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              {tab === 'upcoming' ? 'Find something great to attend' : 'Events you\'ve attended will appear here'}
            </div>
            {tab === 'upcoming' && (
              <Link to="/" className="btn btn-primary btn-sm">
                <i data-lucide="search" style={{ width: 13, height: 13 }} /> Browse Events
              </Link>
            )}
          </div>
        ) : (
          <div className="account-list">
            {shown.slice(0, 6).map(t => (
              <div
                key={t.id}
                className="account-list-row"
                style={{ opacity: (t.is_scanned || t.is_voided) ? 0.65 : 1 }}
              >
                {/* Thumbnail */}
                {t.banner_url
                  ? <img src={t.banner_url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, background: 'var(--surface3)', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i data-lucide="ticket" style={{ width: 18, height: 18, color: 'var(--text3)' }} />
                    </div>
                }

                {/* Details */}
                <div className="account-list-main">
                  <div className="account-list-title">{t.event_title}</div>
                  <div className="account-list-meta">
                    {fmtDate(t.event_date)} · {t.start_time} · {t.ticket_type_name}
                  </div>
                  <div className="account-list-submeta">{t.location}</div>
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {!t.is_voided && <CountdownBadge dateStr={t.event_date} />}
                  {t.is_voided
                    ? <span style={{ fontSize: 11, color: 'var(--danger)' }}>Refunded</span>
                    : t.is_scanned
                    ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>Used</span>
                    : <Link to="/dashboard/tickets" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                        <i data-lucide="ticket" style={{ width: 11, height: 11 }} /> View
                      </Link>
                  }
                </div>
              </div>
            ))}
            {shown.length > 6 && (
              <Link to="/dashboard/tickets" style={{ textAlign: 'center', fontSize: 12, color: 'var(--accent)', padding: '8px 0', textDecoration: 'none' }}>
                View all {shown.length} tickets →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Recent orders */}
      <div>
        <div className="responsive-header" style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700 }}>Recent orders</h2>
          <Link to="/dashboard/history" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
            View all →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="account-empty" style={{ color: 'var(--text3)', fontSize: 13, padding: '32px 24px' }}>
            No orders yet
          </div>
        ) : (
          <div className="account-panel">
            {orders.slice(0, 5).map((o, i) => (
              <div key={o.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: i < Math.min(orders.length, 5) - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.event_title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {fmtDate(o.event_date)} · <span style={{ fontFamily: 'monospace' }}>{o.order_ref}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 13 }}>{fmtCurrency(o.total)}</strong>
                  <Badge variant={o.status === 'success' ? 'green' : o.status === 'refunded' ? 'orange' : 'yellow'}>
                    {o.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
