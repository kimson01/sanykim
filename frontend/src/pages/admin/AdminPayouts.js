// src/pages/admin/AdminPayouts.js
// Admin records M-PESA disbursements to organizers.
// Shows each organizer's available balance, ledger history, and payout controls.
import React, { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

// ── Ledger modal — full transaction history for one organizer ─
function LedgerModal({ org, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getOrgLedger(org.id)
      .then(r => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [org.id]);

  const typeLabel = (type) => ({
    sale:            { label: 'Sale',     variant: 'green'  },
    refund:          { label: 'Refund',   variant: 'red'    },
    payout:          { label: 'Payout',   variant: 'blue'   },
    payout_reversal: { label: 'Reversal', variant: 'orange' },
  }[type] || { label: type, variant: 'gray' });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700 }}>
              Revenue ledger — {org.company_name}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
              Complete transaction history
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <i data-lucide="x" style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
              <i data-lucide="loader-2" style={{ width: 20, height: 20 }} />
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No data</div>
          ) : (
            <>
              {/* Summary strip */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1, background: 'var(--border)', borderRadius: 10,
                overflow: 'hidden', marginBottom: 20,
              }}>
                {[
                  { label: 'Gross earned',    value: fmtCurrency(data.totals?.total_gross      || 0), color: 'var(--text)' },
                  { label: 'Platform fees',   value: fmtCurrency(data.totals?.total_commission || 0), color: 'var(--warning)' },
                  { label: 'Net to organizer',value: fmtCurrency(data.totals?.total_earned     || 0), color: 'var(--accent)' },
                  { label: 'Total refunded',  value: fmtCurrency(data.totals?.total_refunded   || 0), color: 'var(--danger)' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      {s.label}
                    </div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: s.color }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Entries table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Date', 'Type', 'Description', 'Gross', 'Fee', 'Net', 'Balance'].map((h, i) => (
                        <th key={i} style={{
                          padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left',
                          fontSize: 10, color: 'var(--text3)', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          borderBottom: '1px solid var(--border)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                          No transactions yet
                        </td>
                      </tr>
                    ) : data.entries.map((e, i) => {
                      const { label, variant } = typeLabel(e.type);
                      const isNeg = e.net_amount < 0;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                            {fmtDate(e.created_at)}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <Badge variant={variant}>{label}</Badge>
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 12, maxWidth: 220 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.description || e.order_ref || '—'}
                            </div>
                            {e.attendee_name && (
                              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.attendee_name}</div>
                            )}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12 }}>
                            {e.gross_amount !== 0 ? fmtCurrency(Math.abs(e.gross_amount)) : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, color: 'var(--warning)' }}>
                            {e.commission_amt !== 0 ? fmtCurrency(Math.abs(e.commission_amt)) : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>
                            <span style={{ color: isNeg ? 'var(--danger)' : 'var(--accent)', fontSize: 13 }}>
                              {isNeg ? '−' : '+'}{fmtCurrency(Math.abs(e.net_amount))}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700 }}>
                            {fmtCurrency(e.running_balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Payout modal ──────────────────────────────────────────────
function PayoutModal({ org, onClose, onDone }) {
  const [form, setForm] = useState({ amount: '', method: 'mpesa', reference: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { toast } = useToast();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const available = parseFloat(org.available_balance || 0);

  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Enter a valid amount'); return;
    }
    if (parseFloat(form.amount) > available) {
      setError(`Amount exceeds available balance of ${fmtCurrency(available)}`); return;
    }
    setError(''); setLoading(true);
    try {
      const res = await adminAPI.recordPayout(org.id, form);
      toast(res.data.message);
      onDone();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Payout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700 }}>
            Record payout — {org.company_name}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <i data-lucide="x" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div className="modal-body">
          {/* Balance summary */}
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Available balance</span>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>
              {fmtCurrency(available)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Amount */}
            <div className="form-group">
              <label className="form-label">
                Amount (KES) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                className="input"
                type="number"
                min="1"
                max={available}
                value={form.amount}
                onChange={set('amount')}
                placeholder={`Max ${fmtCurrency(available)}`}
              />
              {form.amount && parseFloat(form.amount) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Remaining balance after payout:{' '}
                  <strong style={{ color: 'var(--accent)' }}>
                    {fmtCurrency(Math.max(0, available - parseFloat(form.amount)))}
                  </strong>
                </div>
              )}
            </div>

            {/* Method */}
            <div className="form-group">
              <label className="form-label">Payment method</label>
              <select className="select" value={form.method} onChange={set('method')}>
                <option value="mpesa">M-PESA</option>
                <option value="bank">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            {/* Reference */}
            <div className="form-group">
              <label className="form-label">
                {form.method === 'mpesa' ? 'M-PESA transaction code' : 'Bank reference'}
              </label>
              <input
                className="input"
                value={form.reference}
                onChange={set('reference')}
                placeholder={form.method === 'mpesa' ? 'e.g. QHX4XXXXXX' : 'e.g. TRF-123456'}
              />
            </div>

            {/* Note */}
            <div className="form-group">
              <label className="form-label">Internal note (optional)</label>
              <input
                className="input"
                value={form.note}
                onChange={set('note')}
                placeholder="e.g. February payout, event settlement…"
              />
            </div>

            {/* Warning */}
            <div style={{
              background: 'var(--warning-dim)', border: '1px solid rgba(234,179,8,0.2)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 12, color: 'var(--warning)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <i data-lucide="triangle-alert" style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
              <span>
                This records that you have already sent money to the organizer. Make sure the
                actual M-PESA / bank transfer has been completed before recording here.
              </span>
            </div>

            {error && (
              <div style={{
                background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i data-lucide="circle-x" style={{ width: 14, height: 14 }} />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={loading || !form.amount}
              >
                {loading
                  ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Recording…</>
                  : <><i data-lucide="send" style={{ width: 14, height: 14 }} /> Record payout</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function AdminPayouts() {
  const initialFilters = {
    q: '',
    status: '',
    method: '',
    organizer_id: '',
    date_from: '',
    date_to: '',
    page: 1,
    limit: 10,
  };
  const [organizers, setOrganizers] = useState([]);
  const [historySummary, setHistorySummary] = useState(null);
  const [payoutRows, setPayoutRows] = useState([]);
  const [payoutMeta, setPayoutMeta] = useState({ total: 0 });
  const [loading, setLoading]       = useState(true);
  const [ledgerOrg, setLedgerOrg]   = useState(null);
  const [payoutOrg, setPayoutOrg]   = useState(null);
  const [filters, setFilters] = useState(initialFilters);

  const setFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' || key === 'limit' ? current.page : 1,
    }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, payoutRes] = await Promise.all([
        adminAPI.organizers(),
        adminAPI.getAllPayouts(filters),
      ]);
      setOrganizers(orgRes.data.data || []);
      setPayoutRows(payoutRes.data.data || []);
      setPayoutMeta(payoutRes.data.meta || { total: 0 });
      setHistorySummary(payoutRes.data.summary || null);
    } catch {
      setOrganizers([]);
      setPayoutRows([]);
      setPayoutMeta({ total: 0 });
      setHistorySummary(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Totals
  const totalAvailable = organizers.reduce((s, o) => s + parseFloat(o.available_balance || 0), 0);
  const totalPaidOut   = organizers.reduce((s, o) => s + parseFloat(o.total_paid_out || 0), 0);
  const totalRevenue   = organizers.reduce((s, o) => s + parseFloat(o.total_revenue || 0), 0);
  const totalPages = Math.max(1, Math.ceil((payoutMeta.total || 0) / (Number(filters.limit) || 10)));

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <>
      {/* Summary strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 24,
      }}>
        {[
          { label: 'Total gross revenue',    value: fmtCurrency(totalRevenue),   color: 'var(--text)',    icon: 'trending-up' },
          { label: 'Currently owed to orgs', value: fmtCurrency(totalAvailable), color: 'var(--warning)', icon: 'clock' },
          { label: 'Total paid out',         value: fmtCurrency(totalPaidOut),   color: 'var(--accent)',  icon: 'check-circle' },
          { label: 'Payout records',         value: (historySummary?.total_payouts || 0).toLocaleString(),   color: 'var(--info)', icon: 'receipt' },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '18px 24px',
            borderRight: i < 3 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <i data-lucide={s.icon} style={{ width: 14, height: 14, color: s.color }} />
              <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                {s.label}
              </span>
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, color: s.color }}>
              {s.value}
            </div>
            {s.label === 'Payout records' && historySummary && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                {fmtCurrency(historySummary.completed_amount || 0)} completed
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Organizers table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)' }}>
            Organizer balances ({organizers.length})
          </h2>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Organizer', 'Commission', 'Gross revenue', 'Platform earned', 'Available balance', 'Total paid out', 'Actions'].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 16px', textAlign: i >= 2 ? 'right' : 'left',
                  fontSize: 10, color: 'var(--text3)', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {organizers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  No approved organizers yet
                </td>
              </tr>
            ) : organizers.map((org, i) => {
              const available  = parseFloat(org.available_balance || 0);
              const gross      = parseFloat(org.total_revenue || 0);
              const paidOut    = parseFloat(org.total_paid_out || 0);
              const platformEarned = organizers.length > 0
                ? gross * (parseFloat(org.commission) / 100)
                : 0;
              const hasBalance = available > 0;

              return (
                <tr key={org.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar avatar-orange" style={{ width: 30, height: 30, fontSize: 12, flexShrink: 0 }}>
                        {org.name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{org.company_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{org.name} · {org.event_count} events</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>{org.commission}%</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                    {fmtCurrency(gross)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--warning)' }}>
                    {fmtCurrency(gross - (available + paidOut))}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15,
                      color: hasBalance ? 'var(--accent)' : 'var(--text3)',
                    }}>
                      {fmtCurrency(available)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                    {fmtCurrency(paidOut)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setLedgerOrg(org)}
                        title="View ledger"
                      >
                        <i data-lucide="list" style={{ width: 12, height: 12 }} /> Ledger
                      </button>
                      <button
                        className={`btn btn-sm ${hasBalance ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPayoutOrg(org)}
                        disabled={!hasBalance}
                        title={hasBalance ? 'Record payout' : 'No balance to pay out'}
                      >
                        <i data-lucide="send" style={{ width: 12, height: 12 }} /> Pay out
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', marginBottom: 14 }}>
            Payout history ({payoutMeta.total || payoutRows.length})
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 2fr) repeat(5, minmax(120px, 1fr))',
            gap: 12,
          }}>
            <input
              className="input"
              value={filters.q}
              onChange={setFilter('q')}
              placeholder="Search organizer, reference, note…"
            />
            <select className="select" value={filters.status} onChange={setFilter('status')}>
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
            </select>
            <select className="select" value={filters.method} onChange={setFilter('method')}>
              <option value="">All methods</option>
              <option value="mpesa">M-PESA</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
            <select className="select" value={filters.organizer_id} onChange={setFilter('organizer_id')}>
              <option value="">All organizers</option>
              {organizers.map((org) => (
                <option key={org.id} value={org.id}>{org.company_name}</option>
              ))}
            </select>
            <input className="input" type="date" value={filters.date_from} onChange={setFilter('date_from')} />
            <input className="input" type="date" value={filters.date_to} onChange={setFilter('date_to')} />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Organizer', 'Amount', 'Method', 'Reference', 'Status', 'Processed by', 'Date'].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 16px',
                  textAlign: i === 1 ? 'right' : 'left',
                  fontSize: 10,
                  color: 'var(--text3)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payoutRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  No payouts match the current filters
                </td>
              </tr>
            ) : payoutRows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{row.company_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    Available {fmtCurrency(row.available_balance)}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                  {fmtCurrency(row.amount)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge variant="blue">{String(row.method || 'unknown').toUpperCase()}</Badge>
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11 }}>
                  {row.reference || '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge variant={row.status === 'completed' ? 'green' : 'yellow'}>
                    {row.status}
                  </Badge>
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: 12 }}>
                  {row.processed_by_name || 'System'}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: 12 }}>
                  {fmtDate(row.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Page {filters.page} of {totalPages}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters(initialFilters)}>
              Reset
            </button>
            <select className="select" value={filters.limit} onChange={setFilter('limit')} style={{ minWidth: 88 }}>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))} disabled={filters.page <= 1}>
              Prev
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters((current) => ({ ...current, page: Math.min(totalPages, current.page + 1) }))} disabled={filters.page >= totalPages}>
              Next
            </button>
          </div>
        </div>
      </div>

      {ledgerOrg && (
        <LedgerModal org={ledgerOrg} onClose={() => setLedgerOrg(null)} />
      )}
      {payoutOrg && (
        <PayoutModal
          org={payoutOrg}
          onClose={() => setPayoutOrg(null)}
          onDone={load}
        />
      )}
    </>
  );
}
