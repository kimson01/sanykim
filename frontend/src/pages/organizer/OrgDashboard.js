// src/pages/organizer/OrgDashboard.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventsAPI, analyticsAPI } from '../../api/client';
import { StatCard, fmtCurrency, fmtDate, Badge, useToast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export default function OrgDashboard() {
  const { user }  = useAuth();
  const [events, setEvents]     = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const orgStatus = user?.organizer?.status;
    if (orgStatus === 'pending' || orgStatus === 'suspended') { setLoading(false); return; }
    Promise.all([eventsAPI.myEvents(), analyticsAPI.organizer()])
      .then(([evRes, anRes]) => { setEvents(evRes.data.data); setStats(anRes.data.data); })
      .catch(() => toast('Failed to load data', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const orgStatus = user?.organizer?.status;
  if (orgStatus === 'pending') return (
    <div className="empty-state">
      <div style={{ width: 60, height: 60, background: 'var(--warning-dim)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i data-lucide="clock" style={{ width: 28, height: 28, color: 'var(--warning)' }} />
      </div>
      <div className="empty-title">Account Pending Approval</div>
      <div className="empty-sub">Our team is reviewing your application. You will be notified once approved.</div>
    </div>
  );
  if (orgStatus === 'suspended') return (
    <div className="empty-state">
      <div style={{ width: 60, height: 60, background: 'var(--danger-dim)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i data-lucide="ban" style={{ width: 28, height: 28, color: 'var(--danger)' }} />
      </div>
      <div className="empty-title">Account Suspended</div>
      <div className="empty-sub">Your organizer account has been suspended. Contact support@sanyadventures.com for assistance.</div>
    </div>
  );
  if (orgStatus === 'rejected') return (
    <div className="empty-state">
      <div style={{ width: 60, height: 60, background: 'var(--danger-dim)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i data-lucide="x-circle" style={{ width: 28, height: 28, color: 'var(--danger)' }} />
      </div>
      <div className="empty-title">Application Not Approved</div>
      <div className="empty-sub">Your organizer application was not approved. Please contact support@sanyadventures.com for more information.</div>
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading…</div>;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', marginBottom: 16,
          background: 'var(--info-dim)', border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 10,
        }}
      >
        <i data-lucide="info" style={{ width: 14, height: 14, color: 'var(--info)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--info)' }}>
          Organizer accounts cannot buy tickets. Use a separate attendee account for purchases.
        </span>
      </div>

      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <StatCard label="My Events"      value={stats.total_events}    icon="calendar"    color="var(--accent)"  bg="var(--accent-dim)"  />
          <StatCard label="Tickets Sold"   value={stats.total_tickets}   icon="ticket"      color="var(--accent2)" bg="var(--accent2-dim)" />
          <StatCard label="Attendees"      value={stats.total_attendees} icon="users"       color="var(--info)"    bg="var(--info-dim)"    />
          <StatCard label="Net Revenue"    value={fmtCurrency(stats.net_revenue)} icon="dollar-sign" color="var(--accent)" bg="var(--accent-dim)" sub="After platform fee" />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'Syne', fontSize: 17, fontWeight: 600 }}>My Events</h2>
        <Link to="/organizer/events" className="btn btn-primary btn-sm">
          <i data-lucide="plus" style={{ width: 14, height: 14 }} /> New Event
        </Link>
      </div>
      {events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><i data-lucide="calendar-x" style={{ width: 36, height: 36 }} /></div>
          <div className="empty-title">No events yet</div>
          <div className="empty-sub">Create your first event to start selling tickets</div>
          <Link to="/organizer/events" className="btn btn-primary" style={{ marginTop: 12 }}>
            <i data-lucide="plus" style={{ width: 14, height: 14 }} /> Create Event
          </Link>
        </div>
      ) : (
        <div className="events-grid">
          {events.map(e => (
            <div key={e.id} className="event-card">
              <div className="event-banner">
                {e.banner_url ? <img src={e.banner_url} alt="" /> : null}
                <div className="event-category-tag">{e.category}</div>
              </div>
              <div className="event-card-body">
                <div className="event-card-title">{e.title}</div>
                <div className="event-card-meta">
                  <div className="event-meta-row"><i data-lucide="calendar" style={{ width: 12, height: 12 }} />{fmtDate(e.event_date)}</div>
                  <div className="event-meta-row"><i data-lucide="map-pin" style={{ width: 12, height: 12 }} />{e.location}</div>
                </div>
                <div style={{ background: 'var(--surface3)', borderRadius: 4, height: 3, marginBottom: 8 }}>
                  <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 4, width: `${Math.round((e.total_sold / e.capacity) * 100)}%` }} />
                </div>
                <div className="event-card-footer">
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{e.total_sold}/{e.capacity} sold</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge variant={e.status === 'published' ? 'green' : 'gray'}>{e.status}</Badge>
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{fmtCurrency(e.revenue)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
