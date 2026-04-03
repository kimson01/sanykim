// src/pages/admin/AdminTransactions.js
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

function RefundModal({ order, onClose, onRefunded }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { toast } = useToast();

  const submit = async () => {
    setError(''); setLoading(true);
    try {
      await adminAPI.refundOrder(order.order_id || order.id, { reason });
      toast(`Order ${order.order_ref} refunded`);
      onRefunded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Refund failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="admin-section-title" style={{ marginBottom: 0 }}>Issue Refund</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <i data-lucide="x" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div className="modal-body">
          <div className="admin-modal-summary">
            <div className="admin-modal-summary-title">{order.event_title}</div>
            <div className="admin-modal-summary-meta">
              <span>Order: <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{order.order_ref}</span></span>
              <span>Amount: <strong style={{ color: 'var(--accent)' }}>{fmtCurrency(order.amount || order.total)}</strong></span>
            </div>
          </div>

          <div className="admin-modal-warning">
            <i data-lucide="triangle-alert" style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
            <span>
              This will mark the order as refunded, invalidate all tickets, and reverse the sold count.
              The actual payment reversal must be done manually in your M-PESA / payment dashboard.
            </span>
          </div>

          {error && (
            <div className="admin-modal-error">
              <i data-lucide="circle-x" style={{ width: 14, height: 14, flexShrink: 0 }} />
              {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Reason (optional)</label>
            <textarea
              className="textarea"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Event cancelled, duplicate purchase…"
              style={{ minHeight: 72 }}
            />
          </div>

          <div className="admin-modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" onClick={submit} disabled={loading}>
              {loading
                ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Processing…</>
                : <><i data-lucide="rotate-ccw" style={{ width: 14, height: 14 }} /> Confirm Refund</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminTransactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = {
    q: searchParams.get('q') || '',
    status: searchParams.get('status') || '',
    method: searchParams.get('method') || '',
    organizer_id: searchParams.get('organizer_id') || '',
    event_id: searchParams.get('event_id') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    page: parseInt(searchParams.get('page') || '1', 10) || 1,
    limit: parseInt(searchParams.get('limit') || '20', 10) || 20,
  };
  const [txns, setTxns]         = useState([]);
  const [meta, setMeta]         = useState({ total: 0 });
  const [summary, setSummary]   = useState(null);
  const [recon, setRecon]       = useState(null);
  const [organizers, setOrganizers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refundTarget, setRefundTarget] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const { toast } = useToast();

  const setFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => {
      const next = {
        ...current,
        [key]: value,
        page: key === 'page' || key === 'limit' ? current.page : 1,
      };
      if (key === 'organizer_id') {
        next.event_id = '';
      }
      return next;
    });
  };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminAPI.transactions(filters),
      organizers.length ? Promise.resolve(null) : adminAPI.organizers(),
      events.length ? Promise.resolve(null) : adminAPI.eventOptions(),
    ])
      .then(([txnRes, orgRes, eventRes]) => {
        setTxns(txnRes.data.data || []);
        setMeta(txnRes.data.meta || { total: 0 });
        setSummary(txnRes.data.summary || null);
        setRecon(txnRes.data.reconciliation || null);
        if (orgRes) setOrganizers(orgRes.data.data || []);
        if (eventRes) setEvents(eventRes.data.data || []);
      })
      .catch((err) => {
        setTxns([]);
        setMeta({ total: 0 });
        setSummary(null);
        setRecon(null);
        toast(err.response?.data?.message || 'Failed to load transactions', 'error');
      })
      .finally(() => setLoading(false));
  }, [events.length, filters, organizers.length]);

  const filteredEvents = filters.organizer_id
    ? events.filter((event) => event.organizer_id === filters.organizer_id)
    : events;

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / (Number(filters.limit) || 20)));

  if (loading) return (
    <div className="admin-page-loading">
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <>
      {summary && (
        <div className="responsive-stats-strip admin-surface-card admin-stat-strip">
          {[
            { label: 'Successful', value: summary.successful_transactions, sub: fmtCurrency(summary.successful_amount), color: 'var(--accent)' },
            { label: 'Refunded', value: summary.refunded_transactions, sub: fmtCurrency(summary.refunded_amount), color: 'var(--warning)' },
            { label: 'Pending', value: summary.pending_transactions, sub: `${summary.total_transactions} total`, color: 'var(--info)' },
            {
              label: 'Reconciliation',
              value: fmtCurrency((recon?.tx_success_total || 0) - (recon?.ledger_sales_total || 0)),
              sub: 'tx vs ledger delta',
              color: Math.abs((recon?.tx_success_total || 0) - (recon?.ledger_sales_total || 0)) < 1 ? 'var(--accent)' : 'var(--danger)',
            },
          ].map((item, index) => (
            <div key={item.label} className="admin-stat-cell">
              <div className="admin-stat-label">{item.label}</div>
              <div className="admin-stat-value" style={{ color: item.color }}>
                {typeof item.value === 'number' && item.label !== 'Reconciliation' ? item.value.toLocaleString() : item.value}
              </div>
              <div className="admin-stat-sub">{item.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="admin-section-title">
          All Transactions ({meta.total || txns.length})
        </div>
        <div className="responsive-filter-grid" style={{ marginBottom: 16 }}>
          <input
            className="input filter-search-span-2"
            value={filters.q}
            onChange={setFilter('q')}
            placeholder="Search txn ref, order, attendee, event…"
          />
          <select className="select" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
          </select>
          <select className="select" value={filters.method} onChange={setFilter('method')}>
            <option value="">All methods</option>
            <option value="mpesa">M-PESA</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
          <select className="select" value={filters.organizer_id} onChange={setFilter('organizer_id')}>
            <option value="">All organizers</option>
            {organizers.map((org) => (
              <option key={org.id} value={org.id}>{org.company_name}</option>
            ))}
          </select>
          <select className="select" value={filters.event_id} onChange={setFilter('event_id')}>
            <option value="">All events</option>
            {filteredEvents.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
          <input className="input" type="date" value={filters.date_from} onChange={setFilter('date_from')} />
          <input className="input" type="date" value={filters.date_to} onChange={setFilter('date_to')} />
        </div>
        <div className="admin-toolbar">
          <div className="admin-text-subtle">
            Page {filters.page} of {totalPages}
          </div>
          <div className="admin-toolbar-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters(initialFilters)}>
              Reset
            </button>
            <select className="select" value={filters.limit} onChange={setFilter('limit')} style={{ minWidth: 88 }}>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))} disabled={filters.page <= 1}>
              Prev
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters((current) => ({ ...current, page: Math.min(totalPages, current.page + 1) }))} disabled={filters.page >= totalPages}>
              Next
            </button>
          </div>
        </div>
        <div className="table-wrap responsive-table-shell">
          <table>
            <thead>
              <tr>
                <th>Txn Ref</th>
                <th>Order</th>
                <th>Event</th>
                <th>Attendee</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 && (
                <tr>
                  <td colSpan={9} className="admin-empty-cell">
                    No transactions match the current filters
                  </td>
                </tr>
              )}
              {txns.map(t => (
                <tr key={t.id}>
                  <td className="admin-mono-sm">{t.txn_ref}</td>
                  <td className="admin-mono-sm">{t.order_ref}</td>
                  <td style={{ maxWidth: 160 }}>
                    <div className="admin-ellipsis">
                      {t.event_title}
                    </div>
                  </td>
                  <td className="admin-table-cell-subtle">{t.attendee_name}</td>
                  <td><strong>{fmtCurrency(t.amount)}</strong></td>
                  <td>
                    <Badge variant="blue">{t.method?.toUpperCase()}</Badge>
                  </td>
                  <td>
                    <Badge variant={
                      (t.display_status || t.status) === 'success'  ? 'green'  :
                      (t.display_status || t.status) === 'refunded' ? 'orange' :
                      (t.display_status || t.status) === 'pending'  ? 'yellow' : 'red'
                    }>
                      {t.display_status || t.status}
                    </Badge>
                  </td>
                  <td className="admin-table-cell-subtle">{fmtDate(t.created_at)}</td>
                  <td>
                    {t.is_refundable && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setRefundTarget(t)}
                        title="Issue refund"
                      >
                        <i data-lucide="rotate-ccw" style={{ width: 12, height: 12 }} />
                        Refund
                      </button>
                    )}
                    {!t.is_refundable && (t.display_status || t.status) === 'refunded' && (
                      <span className="admin-stat-sub">Refunded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {recon && (
        <div className="admin-surface-card admin-note-card">
          <div className="admin-note-title">Platform Reconciliation</div>
          <div className="responsive-grid-3" style={{ gap: 12 }}>
            <div className="admin-kpi-card">
              <div className="admin-stat-label">Successful orders</div>
              <div className="admin-detail-value admin-detail-value-strong">{fmtCurrency(recon.orders_success_total)}</div>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-stat-label">Successful transactions</div>
              <div className="admin-detail-value admin-detail-value-strong">{fmtCurrency(recon.tx_success_total)}</div>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-stat-label">Ledger sales</div>
              <div className="admin-detail-value admin-detail-value-strong">{fmtCurrency(recon.ledger_sales_total)}</div>
            </div>
          </div>
        </div>
      )}

      {refundTarget && (
        <RefundModal
          order={refundTarget}
          onClose={() => setRefundTarget(null)}
          onRefunded={load}
        />
      )}
    </>
  );
}
