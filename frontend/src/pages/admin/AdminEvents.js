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
    <div className="admin-page-loading">
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <div className="card">
      {kycWarning && (
        <div className="admin-warning-banner">
          <i data-lucide="shield-alert" style={{ width: 15, height: 15, color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <div className="admin-warning-copy">{kycWarning}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setKycWarning('')}>Dismiss</button>
        </div>
      )}
      <div className="responsive-header" style={{ marginBottom: 16 }}>
        <div className="admin-section-title" style={{ fontSize: 15, marginBottom: 0 }}>
          All Events
          <span className="admin-text-subtle" style={{ fontWeight: 400, marginLeft: 8 }}>
            ({events.length})
          </span>
        </div>
        <div className="admin-filter-chips">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn-sm admin-filter-chip ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
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
                <td colSpan={8} className="admin-empty-cell">
                  No events found
                </td>
              </tr>
            )}
            {events.map(e => {
              const isBusy = acting === e.id;
              return (
                <tr key={e.id}>
                  <td className="admin-event-cell">
                    <div className="admin-event-row">
                      {e.banner_url && (
                        <img
                          src={e.banner_url} alt=""
                          className="admin-event-thumb"
                        />
                      )}
                      <div>
                        <div className="admin-event-title">{e.title}</div>
                        <div className="admin-event-meta">{e.location}</div>
                      </div>
                    </div>
                  </td>

                  <td className="admin-table-cell-subtle">{e.organizer}</td>

                  <td className="admin-table-cell-subtle" style={{ whiteSpace: 'nowrap' }}>
                    {fmtDate(e.event_date)}
                  </td>

                  <td>
                    <div className="admin-capacity-text">{e.total_sold} / {e.capacity}</div>
                    <div className="admin-capacity-bar">
                      <div
                        className="admin-capacity-fill"
                        style={{ width: `${Math.min(Math.round((e.total_sold / e.capacity) * 100), 100)}%` }}
                      />
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

                  <td>
                    <div className="admin-action-cluster">
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
