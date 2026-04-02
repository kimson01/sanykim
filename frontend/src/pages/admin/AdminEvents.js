// src/pages/admin/AdminEvents.js
import React, { useEffect, useState, useCallback } from 'react';
import { eventsAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

const STATUS_VARIANTS = {
  published: 'green',
  draft:     'gray',
  cancelled: 'red',
  completed: 'blue',
};

export default function AdminEvents() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');    // all | published | draft | cancelled
  const [acting, setActing]   = useState(null);      // id being acted on
  const [kycWarning, setKycWarning] = useState('');
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    const params = { limit: 200, ...(filter !== 'all' && { status: filter }) };
    eventsAPI.list(params)
      .then(r => setEvents(r.data.data))
      .catch((err) => {
        setEvents([]);
        toast(err.response?.data?.message || 'Failed to load events', 'error');
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (event, newStatus) => {
    setActing(event.id);
    try {
      await eventsAPI.updateStatus(event.id, { status: newStatus });
      setKycWarning('');
      toast(`"${event.title}" set to ${newStatus}`);
      setEvents(prev =>
        prev.map(e => e.id === event.id ? { ...e, status: newStatus } : e)
      );
    } catch (err) {
      const msg = err.response?.data?.message || 'Update failed';
      const isKycBlock = newStatus === 'published' && err.response?.status === 403
        && /kyc|id|address|terms/i.test(msg);
      if (isKycBlock) {
        const pretty = `Publish blocked for "${event.title}": organizer verification is incomplete (ID, address, or terms).`;
        setKycWarning(pretty);
        toast(pretty, 'error');
      } else {
        toast(msg, 'error');
      }
    } finally {
      setActing(null);
    }
  };

  const toggleFeatured = async (event) => {
    setActing(event.id);
    try {
      await eventsAPI.updateStatus(event.id, { is_featured: !event.is_featured });
      toast(event.is_featured ? 'Removed from featured' : 'Marked as featured');
      setEvents(prev =>
        prev.map(e => e.id === event.id ? { ...e, is_featured: !e.is_featured } : e)
      );
    } catch (err) {
      toast(err.response?.data?.message || 'Update failed', 'error');
    } finally {
      setActing(null);
    }
  };

  const filters = ['all', 'published', 'draft', 'cancelled', 'completed'];

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <div className="card">
      {kycWarning && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px', marginBottom: 14,
          background: 'var(--warning-dim)', border: '1px solid rgba(212,133,10,0.35)',
          borderRadius: 10,
        }}>
          <i data-lucide="shield-alert" style={{ width: 15, height: 15, color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--warning)', flex: 1 }}>{kycWarning}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setKycWarning('')}>Dismiss</button>
        </div>
      )}
      {/* Header + filter chips */}
      <div className="responsive-header" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>
          All Events
          <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
            ({events.length})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap responsive-table-shell">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Organizer</th>
              <th>Date</th>
              <th>Tickets sold</th>
              <th>Revenue</th>
              <th>Status</th>
              <th>Featured</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>
                  No events found
                </td>
              </tr>
            )}
            {events.map(e => {
              const isBusy = acting === e.id;
              return (
                <tr key={e.id}>
                  {/* Event name + location */}
                  <td style={{ minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {e.banner_url && (
                        <img
                          src={e.banner_url} alt=""
                          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 500 }}>{e.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{e.location}</div>
                      </div>
                    </div>
                  </td>

                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{e.organizer}</td>

                  <td style={{ color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {fmtDate(e.event_date)}
                  </td>

                  <td>
                    <div style={{ fontSize: 13 }}>{e.total_sold} / {e.capacity}</div>
                    <div style={{ background: 'var(--surface3)', borderRadius: 2, height: 3, marginTop: 4, width: 60 }}>
                      <div style={{
                        background: 'var(--accent)', height: '100%', borderRadius: 2,
                        width: `${Math.min(Math.round((e.total_sold / e.capacity) * 100), 100)}%`,
                      }} />
                    </div>
                  </td>

                  <td>
                    <strong>{e.min_price > 0 ? fmtCurrency(e.min_price) : 'Free'}</strong>
                  </td>

                  <td>
                    <Badge variant={STATUS_VARIANTS[e.status] || 'gray'}>
                      {e.status}
                    </Badge>
                  </td>

                  {/* Featured star */}
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => toggleFeatured(e)}
                      disabled={isBusy}
                      title={e.is_featured ? 'Remove from featured' : 'Mark as featured'}
                      style={{ color: e.is_featured ? 'var(--warning)' : 'var(--text3)' }}
                    >
                      <i data-lucide="star" style={{ width: 14, height: 14 }} />
                    </button>
                  </td>

                  {/* Status actions */}
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {e.status !== 'published' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setStatus(e, 'published')}
                          disabled={isBusy}
                        >
                          {isBusy
                            ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} />
                            : <><i data-lucide="eye" style={{ width: 12, height: 12 }} /> Publish</>
                          }
                        </button>
                      )}
                      {e.status === 'published' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setStatus(e, 'draft')}
                          disabled={isBusy}
                        >
                          {isBusy
                            ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} />
                            : <><i data-lucide="eye-off" style={{ width: 12, height: 12 }} /> Unpublish</>
                          }
                        </button>
                      )}
                      {e.status !== 'cancelled' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setStatus(e, 'cancelled')}
                          disabled={isBusy}
                        >
                          <i data-lucide="ban" style={{ width: 12, height: 12 }} /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
