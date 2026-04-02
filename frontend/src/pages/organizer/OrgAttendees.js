// src/pages/organizer/OrgAttendees.js
import React, { useEffect, useState } from 'react';
import { ordersAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

export default function OrgAttendees() {
  const [orders, setOrders]   = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    ordersAPI.myOrders()
      .then(r => {
        setOrders(r.data.data);
        setFiltered(r.data.data);
      })
      .catch((err) => {
        setOrders([]);
        setFiltered([]);
        toast(err.response?.data?.message || 'Failed to load attendees', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  // Derive unique event list for filter dropdown
  const events = [...new Map(orders.map(o => [o.event_id, o.event_title])).entries()];

  // Apply filters whenever inputs change
  useEffect(() => {
    let result = orders;
    if (eventFilter !== 'all') {
      result = result.filter(o => o.event_id === eventFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(o => o.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        o.attendee_name?.toLowerCase().includes(q) ||
        o.attendee_email?.toLowerCase().includes(q) ||
        o.attendee_phone?.toLowerCase().includes(q) ||
        o.order_ref?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, eventFilter, statusFilter, orders]);

  const exportCSV = () => {
    const rows = [
      ['Order Ref', 'Attendee', 'Email', 'Phone', 'Event', 'Ticket Amount', 'Status', 'Date'],
      ...filtered.map(o => [
        o.order_ref,
        o.attendee_name,
        o.attendee_email,
        o.attendee_phone || '',
        o.event_title,
        o.total,
        o.status,
        new Date(o.created_at).toLocaleDateString('en-KE'),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendees-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  const successCount = filtered.filter(o => o.status === 'success').length;
  const totalRevenue = filtered.filter(o => o.status === 'success')
                                .reduce((s, o) => s + Number(o.total), 0);
  const statusVariant = (status) => (
    status === 'success' ? 'green' :
    status === 'pending' ? 'yellow' :
    status === 'refunded' ? 'orange' : 'red'
  );

  return (
    <div>
      {/* Summary strip */}
      <div className="responsive-grid-3" style={{
        gap: 0,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 20,
      }}>
        {[
          { label: 'Total orders',     value: filtered.length, color: 'var(--text)' },
          { label: 'Confirmed',        value: successCount,    color: 'var(--accent)' },
          { label: 'Revenue (shown)',  value: fmtCurrency(totalRevenue), color: 'var(--accent)' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 20px', borderRight: i < 2 ? '1px solid var(--border)' : 'none', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Export */}
      <div className="responsive-actions" style={{ marginBottom: 16, alignItems: 'center' }}>
        {/* Search */}
        <div className="search-bar" style={{ flex: '1 1 200px', minWidth: 180 }}>
          <i data-lucide="search" style={{ width: 14, height: 14, color: 'var(--text3)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, ref…"
            style={{ width: '100%' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
              <i data-lucide="x" style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>

        {/* Event filter */}
        <select
          className="select"
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="all">All events</option>
          {events.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="all">All statuses</option>
          <option value="success">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="failed">Failed</option>
        </select>

        {/* Export CSV */}
        <button className="btn btn-secondary btn-sm" onClick={exportCSV} style={{ flexShrink: 0 }}>
          <i data-lucide="download" style={{ width: 13, height: 13 }} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="desktop-only-block" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div className="responsive-table-shell">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Order Ref', 'Attendee', 'Email', 'Phone', 'Event', 'Amount', 'Status', 'Date'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {orders.length === 0 ? 'No attendees yet' : 'No results match your filters'}
                  </td>
                </tr>
              ) : filtered.map((o, i) => (
                <tr key={o.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text2)' }}>{o.order_ref}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 500, fontSize: 13 }}>{o.attendee_name}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text2)', fontSize: 12 }}>{o.attendee_email}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text2)', fontSize: 12 }}>{o.attendee_phone || '—'}</td>
                  <td style={{ padding: '11px 14px', maxWidth: 150 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{o.event_title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtDate(o.event_date)}</div>
                  </td>
                  <td style={{ padding: '11px 14px' }}><strong style={{ fontSize: 13 }}>{fmtCurrency(o.total)}</strong></td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge variant={statusVariant(o.status)}>
                      {o.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-only-block" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>
            {orders.length === 0 ? 'No attendees yet' : 'No results match your filters'}
          </div>
        ) : filtered.map((o) => (
          <div key={o.id} className="card" style={{ padding: 16 }}>
            <div className="responsive-header" style={{ marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{o.attendee_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', marginTop: 3 }}>{o.order_ref}</div>
              </div>
              <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Event</div>
                <div style={{ fontWeight: 600 }}>{o.event_title}</div>
                <div style={{ color: 'var(--text2)', marginTop: 2 }}>{fmtDate(o.event_date)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Contact</div>
                <div style={{ color: 'var(--text2)' }}>{o.attendee_email}</div>
                <div style={{ color: 'var(--text2)', marginTop: 2 }}>{o.attendee_phone || 'No phone provided'}</div>
              </div>
              <div className="responsive-header">
                <div>
                  <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Amount</div>
                  <strong style={{ fontSize: 14 }}>{fmtCurrency(o.total)}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Ordered</div>
                  <div style={{ color: 'var(--text2)' }}>{fmtDate(o.created_at)}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
