// src/pages/admin/AdminDashboard.js
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminAPI, supportAPI } from '../../api/client';
import { fmtCurrency, fmtDate, Badge, useToast } from '../../components/ui';

// ── Inline sparkline bar (pure CSS, no deps) ──────────────────
function MiniBar({ data, valueKey, color = 'var(--accent)', height = 48 }) {
  if (!data?.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>No data yet</span>
    </div>
  );
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((d, i) => {
        const pct = Math.round((Number(d[valueKey]) / max) * 100);
        const isLast = i === data.length - 1;
        return (
          <div
            key={i}
            title={`${d.day || d.month ? new Date(d.day || d.month).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : ''}: ${valueKey === 'revenue' ? fmtCurrency(d[valueKey]) : d[valueKey]}`}
            style={{
              flex: 1,
              height: `${Math.max(pct, 4)}%`,
              background: isLast ? color : `${color}55`,
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.4s',
              cursor: 'default',
              minHeight: 3,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Single KPI row (label + value, no card border) ────────────
function KpiRow({ label, value, sub, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: accent || 'var(--text)' }}>
          {value}
        </span>
        {sub && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Section heading (replaces card titles) ────────────────────
function SectionHead({ title, action, to }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)' }}>
        {title}
      </h2>
      {action && to && (
        <Link to={to} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
          {action} →
        </Link>
      )}
    </div>
  );
}

// ── Pending organizer quick-action row ────────────────────────
function PendingOrgRow({ org, onApprove }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const approve = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminAPI.updateOrgStatus(org.id, 'approved');
      toast(`${org.company_name} approved`);
      onApprove();
    } catch { toast('Failed', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="avatar avatar-orange" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
        {org.name?.[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {org.company_name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          {org.name} · Applied {fmtDate(org.created_at)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={approve}
          disabled={loading}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >
          {loading
            ? <i data-lucide="loader-2" style={{ width: 11, height: 11 }} />
            : 'Approve'
          }
        </button>
        <Link to="/admin/organizers" className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>
          Review
        </Link>
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [supportOverview, setSupportOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(() => {
    Promise.all([
      adminAPI.dashboard(),
      supportAPI.adminOverview(),
    ])
      .then(([dashboardRes, supportRes]) => {
        setData(dashboardRes.data.data);
        setSupportOverview(supportRes.data.data || null);
      })
      .catch((err) => {
        setData(null);
        setSupportOverview(null);
        toast(err.response?.data?.message || 'Failed to load dashboard data', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );
  if (!data) return null;

  const { stats, recent_orders, top_events, pending_org_details,
          top_organizers, daily_revenue, monthly_revenue, order_breakdown } = data;

  // Order status breakdown helper
  const orderStatus = (status) => {
    const row = order_breakdown?.find(r => r.status === status);
    return { count: parseInt(row?.total || 0), revenue: parseFloat(row?.revenue || 0) };
  };
  const successOrders  = orderStatus('success');
  const pendingOrders  = orderStatus('pending');
  const refundedOrders = orderStatus('refunded');
  const supportMetrics = supportOverview?.metrics || {};
  const supportLanes = supportOverview?.lanes || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Purchase policy notice ───────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px',
          background: 'var(--info-dim)', border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 10,
        }}
      >
        <i data-lucide="info" style={{ width: 14, height: 14, color: 'var(--info)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--info)' }}>
          Admin accounts cannot buy tickets. Use a separate attendee account to make test or real purchases.
        </span>
      </div>

      {/* ── Alert banner: pending organizers ──────────────── */}
      {stats.pending_organizers > 0 && (
        <div
          onClick={() => navigate('/admin/organizers?status=pending')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '12px 16px',
            background: 'var(--warning-dim)', border: '1px solid rgba(234,179,8,0.25)',
            borderRadius: 10, cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i data-lucide="clock" style={{ width: 16, height: 16, color: 'var(--warning)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>
              {stats.pending_organizers} organizer application{stats.pending_organizers !== 1 ? 's' : ''} awaiting review
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--warning)', whiteSpace: 'nowrap' }}>Review now →</span>
        </div>
      )}

      {/* ── Top metrics row — borderless inline stats ─────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {[
          { label: 'Platform revenue',  value: fmtCurrency(stats.platform_revenue), sub: `from ${fmtCurrency(stats.gross_revenue)} gross`, color: 'var(--accent)', icon: 'trending-up' },
          { label: 'Tickets sold',       value: stats.total_tickets_sold.toLocaleString(), sub: `across ${stats.total_events} events`, color: 'var(--info)', icon: 'ticket' },
          { label: 'Total users',        value: stats.total_users.toLocaleString(), sub: `${stats.total_organizers} organizers`, color: 'var(--accent2)', icon: 'users' },
          { label: 'Today',              value: fmtCurrency(stats.today_revenue), sub: `${stats.today_orders} orders today`, color: 'var(--accent)', icon: 'zap' },
        ].map((m, i) => (
          <div key={i} style={{
            padding: '18px 20px',
            borderRight: i < 3 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <i data-lucide={m.icon} style={{ width: 14, height: 14, color: m.color }} />
              <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                {m.label}
              </span>
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, color: m.color, lineHeight: 1 }}>
              {m.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Main grid: chart + order status + weekly ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>

        {/* Revenue chart — 14-day */}
        <div>
          <SectionHead title="Daily revenue — last 14 days" />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700 }}>
                  {fmtCurrency(daily_revenue.reduce((s, d) => s + parseFloat(d.revenue), 0))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {daily_revenue.reduce((s, d) => s + parseInt(d.orders), 0)} orders
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                This week: <strong style={{ color: 'var(--text2)' }}>{fmtCurrency(stats.week_revenue)}</strong>
                {' · '}{stats.week_orders} orders
              </div>
            </div>
            <MiniBar data={daily_revenue} valueKey="revenue" color="var(--accent)" height={80} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>
              {daily_revenue.length > 0 && <>
                <span>{new Date(daily_revenue[0]?.day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                <span>Today</span>
              </>}
            </div>
          </div>
        </div>

        {/* Order status breakdown */}
        <div>
          <SectionHead title="Order status" action="All orders" to="/admin/transactions" />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            {[
              { label: 'Successful', count: successOrders.count,  revenue: successOrders.revenue,  color: 'var(--accent)' },
              { label: 'Pending',    count: pendingOrders.count,   revenue: pendingOrders.revenue,   color: 'var(--warning)' },
              { label: 'Refunded',   count: refundedOrders.count,  revenue: refundedOrders.revenue,  color: 'var(--danger)' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: s.color }}>
                    {s.count.toLocaleString()}
                  </span>
                </div>
                <div style={{ background: 'var(--surface3)', borderRadius: 3, height: 3 }}>
                  <div style={{
                    background: s.color, height: '100%', borderRadius: 3,
                    width: `${successOrders.count > 0 ? Math.round((s.count / (successOrders.count || 1)) * 100) : 0}%`,
                    transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                  {fmtCurrency(s.revenue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Second row: pending orgs + top events ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Pending organizer applications */}
        <div>
          <SectionHead
            title={`Pending applications${stats.pending_organizers > 0 ? ` (${stats.pending_organizers})` : ''}`}
            action="All organizers"
            to="/admin/organizers"
          />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 16px' }}>
            {pending_org_details.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                <i data-lucide="check-circle" style={{ width: 20, height: 20, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                All applications reviewed
              </div>
            ) : (
              pending_org_details.map(org => (
                <PendingOrgRow key={org.id} org={org} onApprove={load} />
              ))
            )}
          </div>
        </div>

        {/* Top events by revenue */}
        <div>
          <SectionHead title="Top events by revenue" action="All events" to="/admin/events" />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 16px' }}>
            {top_events.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No published events yet
              </div>
            ) : top_events.map((e, i) => {
              const capPct = Math.min(Math.round((e.total_sold / e.capacity) * 100), 100);
              return (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < top_events.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {fmtDate(e.event_date)} · {e.total_sold}/{e.capacity} sold
                      </div>
                    </div>
                    <strong style={{ fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
                      {fmtCurrency(e.revenue)}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--surface3)', borderRadius: 3, height: 3 }}>
                    <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 3, width: `${capPct}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Support overview + monthly chart ─────────────── */} 
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <SectionHead title="Support Overview" action="Open inbox" to="/admin/conflicts" />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Open', value: supportMetrics.open || 0, color: 'var(--text)' },
                { label: 'Escalated', value: supportMetrics.escalated || 0, color: 'var(--danger)' },
                { label: 'Overdue', value: supportMetrics.overdue || 0, color: 'var(--warning)' },
                { label: 'Unread', value: supportMetrics.unread_total || 0, color: 'var(--info)' },
              ].map((item) => (
                <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: item.color }}>
                    {item.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Badge variant="red">Super Admin {supportLanes.super_admin || 0}</Badge>
              <Badge variant="yellow">Organizer {supportLanes.organizer || 0}</Badge>
              <Badge variant="blue">Due Soon {supportMetrics.due_soon || 0}</Badge>
              <Badge variant="gray">Resolved {supportMetrics.resolved || 0}</Badge>
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.7 }}>
              Use the inbox when escalations rise, unread volume climbs, or overdue threads appear. This panel tracks the support workload without leaving the dashboard.
            </div>
          </div>
        </div>

        {/* 6-month revenue chart + KPIs */}
        <div>
          <SectionHead title="Monthly revenue — 6 months" />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <MiniBar data={monthly_revenue} valueKey="revenue" color="var(--info)" height={72} />
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <KpiRow label="Gross revenue (all time)"    value={fmtCurrency(stats.gross_revenue)} />
              <KpiRow label="Platform revenue (all time)" value={fmtCurrency(stats.platform_revenue)} accent="var(--accent)" />
              <KpiRow label="This week"                   value={fmtCurrency(stats.week_revenue)} sub={`${stats.week_orders} orders`} />
              <KpiRow label="Today"                       value={fmtCurrency(stats.today_revenue)} sub={`${stats.today_orders} orders`} accent="var(--accent2)" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Third row: top organizers ──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>

        {/* Top organizers */}
        <div>
          <SectionHead title="Top organizers by revenue" action="All organizers" to="/admin/organizers" />
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Organizer</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Events</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top_organizers.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No data yet</td></tr>
                ) : top_organizers.map((o, i) => (
                  <tr key={i} style={{ borderBottom: i < top_organizers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{o.company_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{o.commission}% commission</div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>{o.event_count}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <strong style={{ fontSize: 13, color: 'var(--accent)' }}>{fmtCurrency(o.total_revenue)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Recent transactions table ─────────────────────── */}
      <div>
        <SectionHead title="Recent transactions" action="View all" to="/admin/transactions" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Order ref', 'Event', 'Attendee', 'Amount', 'Method', 'Status', 'Date'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent_orders.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No orders yet</td></tr>
              ) : recent_orders.map((o, i) => (
                <tr key={i} style={{ borderBottom: i < recent_orders.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text2)' }}>{o.order_ref}</td>
                  <td style={{ padding: '11px 16px', maxWidth: 160 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 }}>{o.event_title}</div>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text2)' }}>{o.attendee_name}</td>
                  <td style={{ padding: '11px 16px' }}><strong style={{ fontSize: 13 }}>{fmtCurrency(o.total)}</strong></td>
                  <td style={{ padding: '11px 16px' }}>
                    <Badge variant="blue">{(o.payment_method || 'mpesa').toUpperCase()}</Badge>
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <Badge variant={o.status === 'success' ? 'green' : o.status === 'pending' ? 'yellow' : o.status === 'refunded' ? 'orange' : 'red'}>
                      {o.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
