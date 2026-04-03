import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminAPI } from '../../api/client';
import { Badge, Modal, fmtDate, useToast } from '../../components/ui';

const sourceVariant = {
  admin: 'red',
  support: 'blue',
  platform: 'green',
};

const sourceLabel = {
  admin: 'Admin',
  support: 'Support',
  platform: 'Platform',
};

const emptyMeta = {
  total: 0,
  sources: {},
  filter_options: {
    action_types: [],
    domains: [],
    severities: [],
  },
};

function formatActionLabel(actionType) {
  if (!actionType) return 'Unknown';
  return String(actionType)
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildPreview(row) {
  const payload = row?.payload || {};
  const data = payload.data || {};
  const details = [];

  if (payload.ticket_ref) details.push(`Ticket ${payload.ticket_ref}`);
  if (payload.ticket_status) details.push(`Status ${payload.ticket_status}`);
  if (payload.domain) details.push(`Domain ${payload.domain}`);
  if (payload.severity && payload.severity !== 'info') details.push(`Severity ${payload.severity}`);
  if (data.ticket_ref) details.push(`Ticket ${data.ticket_ref}`);
  if (data.ticket_status) details.push(`Status ${data.ticket_status}`);
  if (data.order_ref) details.push(`Order ${data.order_ref}`);
  if (data.reason) details.push(String(data.reason));
  if (data.method) details.push(`Method ${data.method}`);
  if (data.company_name) details.push(data.company_name);
  if (payload.status) details.push(`Status ${payload.status}`);
  if (payload.commission !== undefined) details.push(`Commission ${payload.commission}%`);
  if (payload.refund_amount !== undefined) details.push(`Refund KES ${Number(payload.refund_amount).toLocaleString('en-KE')}`);
  if (payload.reason) details.push(String(payload.reason));
  if (data.amount !== undefined) details.push(`KES ${Number(data.amount).toLocaleString('en-KE')}`);
  if (data.refund_amount !== undefined) details.push(`Refund KES ${Number(data.refund_amount).toLocaleString('en-KE')}`);
  if (data.commission !== undefined) details.push(`Commission ${data.commission}%`);
  if (data.to) details.push(`To ${data.to}`);
  if (data.from && data.to) details.push(`${data.from} -> ${data.to}`);

  return details.slice(0, 2).join(' • ');
}

export default function AdminLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = {
    q: searchParams.get('q') || '',
    source: searchParams.get('source') || '',
    action_type: searchParams.get('action_type') || '',
    domain: searchParams.get('domain') || '',
    severity: searchParams.get('severity') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    page: parseInt(searchParams.get('page') || '1', 10) || 1,
    limit: parseInt(searchParams.get('limit') || '25', 10) || 25,
  };
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(emptyMeta);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedRow, setSelectedRow] = useState(null);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const setFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: 1,
    }));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    adminAPI.logs(filters)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data.data || []);
        setMeta(res.data.meta || emptyMeta);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setMeta(emptyMeta);
        const message = err.response?.data?.message || 'Failed to load admin logs';
        setError(message);
        toast(message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const actionOptions = meta.filter_options?.action_types || [];
  const domainOptions = meta.filter_options?.domains || [];
  const severityOptions = meta.filter_options?.severities || [];
  const showDomainFilter = domainOptions.length > 0;
  const showSeverityFilter = severityOptions.length > 0;

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / (Number(filters.limit) || 25)));

  if (loading) {
    return (
      <div className="card admin-loading-card">
        <div className="admin-loading-copy">
          <div className="spinner admin-loading-spinner" />
          Loading admin logs...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        {error && (
          <div className="admin-alert admin-alert-danger">
            {error}
          </div>
        )}

        <div className="responsive-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="admin-section-title" style={{ marginBottom: 0 }}>
              Admin Logs ({meta.total || rows.length})
            </div>
            <div className="admin-text-subtle" style={{ marginTop: 4 }}>
              Unified stream of admin actions and admin-side support interventions.
            </div>
          </div>
          <div className="admin-text-subtle">
            Page {filters.page} of {totalPages}
          </div>
        </div>

        <div className="responsive-grid-4" style={{ gap: 12, marginBottom: 16 }}>
          {[
            { label: 'All visible logs', value: meta.total || rows.length, sub: 'Current filtered result set', color: 'var(--text)' },
            { label: 'Admin actions', value: meta.sources?.admin || 0, sub: 'Platform-side actions', color: 'var(--danger)' },
            { label: 'Support actions', value: meta.sources?.support || 0, sub: 'Admin conflict interventions', color: 'var(--info)' },
            { label: 'Platform events', value: meta.sources?.platform || 0, sub: 'Auth, payments, orders, tickets', color: 'var(--accent)' },
          ].map((item) => (
            <div key={item.label} className="admin-kpi-card admin-kpi-card-soft">
              <div className="admin-stat-label">{item.label}</div>
              <div className="admin-stat-value admin-stat-value-lg" style={{ color: item.color }}>
                {Number(item.value || 0).toLocaleString()}
              </div>
              <div className="admin-text-subtle" style={{ marginTop: 4 }}>{item.sub}</div>
            </div>
          ))}
        </div>

        <div className="responsive-filter-grid" style={{ marginBottom: 16 }}>
          <input
            className="input filter-search-span-2"
            value={filters.q}
            onChange={setFilter('q')}
            placeholder="Search summary, actor, action, entity…"
          />
          <select className="select" value={filters.source} onChange={setFilter('source')}>
            <option value="">All sources</option>
            <option value="admin">Admin actions</option>
            <option value="support">Support actions</option>
            <option value="platform">Platform events</option>
          </select>
          <select className="select" value={filters.action_type} onChange={setFilter('action_type')}>
            <option value="">All actions</option>
            {actionOptions.map((action) => (
              <option key={action.value} value={action.value}>
                {formatActionLabel(action.value)} ({action.count})
              </option>
            ))}
          </select>
          {showDomainFilter && (
            <select className="select" value={filters.domain} onChange={setFilter('domain')}>
              <option value="">All domains</option>
              {domainOptions.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {formatActionLabel(domain.value)} ({domain.count})
                </option>
              ))}
            </select>
          )}
          {showSeverityFilter && (
            <select className="select" value={filters.severity} onChange={setFilter('severity')}>
              <option value="">All severities</option>
              {severityOptions.map((severity) => (
                <option key={severity.value} value={severity.value}>
                  {formatActionLabel(severity.value)} ({severity.count})
                </option>
              ))}
            </select>
          )}
          <input className="input" type="date" value={filters.date_from} onChange={setFilter('date_from')} />
          <input className="input" type="date" value={filters.date_to} onChange={setFilter('date_to')} />
        </div>

        <div className="responsive-header" style={{ marginBottom: 12 }}>
          <div className="admin-text-subtle">
            Showing {rows.length} of {meta.total || rows.length} entries
          </div>
          <div className="admin-toolbar-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters(initialFilters)}>
              Reset
            </button>
            <select
              className="select"
              value={filters.limit}
              onChange={setFilter('limit')}
              style={{ minWidth: 88 }}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
              disabled={filters.page <= 1}
            >
              Prev
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setFilters((current) => ({ ...current, page: Math.min(totalPages, current.page + 1) }))}
              disabled={filters.page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>

        <div className="table-wrap responsive-table-shell">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-empty-cell">
                    No log entries match the current filters
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const preview = buildPreview(row);

                return (
                  <tr key={`${row.log_source}-${row.id}`}>
                    <td className="admin-table-cell-subtle" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(row.created_at)}
                      <div className="admin-stat-sub">
                        {new Date(row.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <Badge variant={sourceVariant[row.log_source] || 'gray'}>
                        {sourceLabel[row.log_source] || row.log_source}
                      </Badge>
                    </td>
                    <td className="admin-table-cell-tight">
                      <div className="admin-detail-value-strong">{row.actor_name || row.actor_role || 'System'}</div>
                      <div className="admin-stat-sub">{row.actor_email || '—'}</div>
                    </td>
                    <td className="admin-table-cell-tight">
                      <div className="admin-mono-sm">{row.action_type}</div>
                      <div className="admin-stat-sub">{formatActionLabel(row.action_type)}</div>
                    </td>
                    <td className="admin-table-cell-tight">
                      <div>{row.entity_type}</div>
                      <div className="admin-stat-sub" style={{ fontFamily: 'monospace', fontSize: 10 }}>
                        {row.entity_id || '—'}
                      </div>
                    </td>
                    <td className="admin-table-cell-subtle" style={{ minWidth: 240 }}>
                      {row.summary}
                    </td>
                    <td className="admin-table-cell-tight" style={{ minWidth: 180 }}>
                      <div className="admin-text-subtle" style={{ marginBottom: 8 }}>
                        {preview || 'No extra details'}
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedRow(row)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `${formatActionLabel(selectedRow.action_type)} Log` : 'Log Entry'}
        size="lg"
      >
        {selectedRow && (
          <div className="admin-detail-stack">
            <div className="responsive-grid-4" style={{ gap: 12 }}>
              <div className="admin-detail-card">
                <div className="admin-detail-label">Source</div>
                <div className="admin-detail-value"><Badge variant={sourceVariant[selectedRow.log_source] || 'gray'}>{sourceLabel[selectedRow.log_source] || selectedRow.log_source}</Badge></div>
              </div>
              <div className="admin-detail-card">
                <div className="admin-detail-label">Actor</div>
                <div className="admin-detail-value admin-detail-value-strong">{selectedRow.actor_name || selectedRow.actor_role || 'System'}</div>
                <div className="admin-text-subtle">{selectedRow.actor_email || '—'}</div>
              </div>
              <div className="admin-detail-card">
                <div className="admin-detail-label">When</div>
                <div className="admin-detail-value admin-detail-value-strong">{new Date(selectedRow.created_at).toLocaleString('en-KE')}</div>
              </div>
              {selectedRow.payload?.domain && (
                <div className="admin-detail-card">
                  <div className="admin-detail-label">Domain</div>
                  <div className="admin-detail-value admin-detail-value-strong">{selectedRow.payload.domain}</div>
                  <div className="admin-text-subtle">Severity: {selectedRow.payload.severity || 'info'}</div>
                </div>
              )}
            </div>

            <div className="admin-detail-card" style={{ padding: 14 }}>
              <div className="admin-detail-label" style={{ marginBottom: 8 }}>Summary</div>
              <div className="admin-modal-summary-title" style={{ marginBottom: 12 }}>{selectedRow.summary}</div>
              <div className="responsive-grid-2" style={{ gap: 12 }}>
                <div>
                  <div className="admin-text-subtle">Action</div>
                  <div className="admin-mono-sm" style={{ marginTop: 4 }}>{selectedRow.action_type}</div>
                </div>
                <div>
                  <div className="admin-text-subtle">Entity</div>
                  <div style={{ marginTop: 4 }}>{selectedRow.entity_type}</div>
                  <div className="admin-mono-sm admin-text-subtle" style={{ marginTop: 4 }}>{selectedRow.entity_id || '—'}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="admin-detail-label" style={{ marginBottom: 8 }}>Payload</div>
              <pre className="admin-payload-block">
                {JSON.stringify(selectedRow.payload || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
