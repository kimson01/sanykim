// src/pages/organizer/OrgAnalytics.js
// Phase 3: CSS-only bar + line charts, per-type breakdown, day-range selector
import React, { useEffect, useState, useCallback } from 'react';
import { analyticsAPI } from '../../api/client';
import { StatCard, fmtCurrency } from '../../components/ui';

// ── Inline bar chart (no dependencies) ───────────────────────
function BarChart({ data, valueKey, labelKey, color = 'var(--accent)', height = 100 }) {
  if (!data?.length) return (
    <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24, fontSize: 13 }}>
      No data yet
    </div>
  );
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, overflow: 'hidden' }}>
      {data.map((d, i) => {
        const pct = Math.round((Number(d[valueKey]) / max) * 100);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div
              title={`${d[labelKey]}: ${d[valueKey]}`}
              style={{
                width: '100%', background: color, borderRadius: '3px 3px 0 0',
                height: `${Math.max(pct, 2)}%`, transition: 'height 0.4s',
                minHeight: 2,
              }}
            />
            {data.length <= 14 && (
              <span style={{ fontSize: 9, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                {String(d[labelKey]).slice(-5)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Donut-style percentage bar per ticket type ────────────────
function TypeRow({ name, revenue, sold, color, maxRevenue }) {
  const pct = maxRevenue > 0 ? Math.round((revenue / maxRevenue) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color || 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>{name}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, color: 'var(--text2)' }}>
          <span style={{ fontSize: 11 }}>{sold} sold</span>
          <strong style={{ color: 'var(--accent)', fontSize: 13 }}>{fmtCurrency(revenue)}</strong>
        </div>
      </div>
      <div style={{ background: 'var(--surface3)', borderRadius: 4, height: 5 }}>
        <div style={{
          background: color || 'var(--accent)', height: '100%',
          borderRadius: 4, width: `${pct}%`, transition: 'width 0.5s',
        }} />
      </div>
    </div>
  );
}

// ── Summary stat row ──────────────────────────────────────────
function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrgAnalytics() {
  const [overview, setOverview]   = useState(null);
  const [sales, setSales]         = useState(null);
  const [days, setDays]           = useState(30);
  const [loading, setLoading]     = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);

  // Load summary stats
  useEffect(() => {
    analyticsAPI.organizer()
      .then(r => setOverview(r.data.data))
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);

  // Load chart data
  const loadSales = useCallback((d) => {
    setSalesLoading(true);
    analyticsAPI.orgSalesByDay(d)
      .then(r => setSales(r.data.data))
      .catch(() => {})
      .finally(() => setSalesLoading(false));
  }, []);

  useEffect(() => { loadSales(days); }, [days, loadSales]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );
  if (!overview) return null;

  const maxTypeRev = sales?.by_type?.length
    ? Math.max(...sales.by_type.map(t => Number(t.revenue)))
    : 1;

  // Format daily data labels as short dates
  const dailyData = (sales?.daily || []).map(d => ({
    ...d,
    label:   new Date(d.day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }),
    revenue: Number(d.revenue),
    tickets: Number(d.tickets),
  }));

  return (
    <div>
      {/* ── Stat cards ── */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <StatCard label="Total Events"  value={overview.total_events}  icon="calendar"    color="var(--accent)"  bg="var(--accent-dim)" />
        <StatCard label="Tickets Sold"  value={overview.total_tickets} icon="ticket"      color="var(--accent2)" bg="var(--accent2-dim)" />
        <StatCard label="Gross Revenue" value={fmtCurrency(overview.gross_revenue)} icon="dollar-sign" color="var(--info)" bg="var(--info-dim)" />
        <StatCard
          label="Net Revenue"
          value={fmtCurrency(overview.net_revenue)}
          icon="trending-up"
          color="var(--accent)"
          bg="var(--accent-dim)"
          sub="After platform fee"
        />
      </div>

      <div className="responsive-grid-2" style={{ gap: 20, marginBottom: 20 }}>

        {/* ── Revenue chart ── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>Daily revenue</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[7, 14, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '3px 10px', fontSize: 11 }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {salesLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
              <i data-lucide="loader-2" style={{ width: 18, height: 18 }} />
            </div>
          ) : (
            <>
              <BarChart data={dailyData} valueKey="revenue" labelKey="label" color="var(--accent)" height={110} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                <span>Last {days} days</span>
                <span>
                  Total: <strong style={{ color: 'var(--text)' }}>
                    {fmtCurrency(dailyData.reduce((s, d) => s + d.revenue, 0))}
                  </strong>
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Tickets chart ── */}
        <div className="card">
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
            Daily tickets sold
          </div>
          {salesLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
              <i data-lucide="loader-2" style={{ width: 18, height: 18 }} />
            </div>
          ) : (
            <>
              <BarChart data={dailyData} valueKey="tickets" labelKey="label" color="var(--accent2)" height={110} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                <span>Last {days} days</span>
                <span>
                  Total: <strong style={{ color: 'var(--text)' }}>
                    {dailyData.reduce((s, d) => s + d.tickets, 0)} tickets
                  </strong>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="responsive-grid-2" style={{ gap: 20 }}>

        {/* ── Ticket type breakdown ── */}
        <div className="card">
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
            Revenue by ticket type
          </div>
          {!sales?.by_type?.length ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24, fontSize: 13 }}>
              No ticket sales yet
            </div>
          ) : sales.by_type.map((t, i) => (
            <TypeRow
              key={i}
              name={t.name}
              revenue={Number(t.revenue)}
              sold={t.sold}
              color={t.color}
              maxRevenue={maxTypeRev}
            />
          ))}
        </div>

        {/* ── Top events summary ── */}
        <div className="card">
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
            Top events
          </div>
          {!overview.top_events?.length ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24, fontSize: 13 }}>
              No events yet
            </div>
          ) : (
            <>
              {overview.top_events.map((e, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                      {e.title}
                    </span>
                    <strong style={{ color: 'var(--accent)', flexShrink: 0 }}>{fmtCurrency(e.revenue)}</strong>
                  </div>
                  <div style={{ background: 'var(--surface3)', borderRadius: 4, height: 5 }}>
                    <div style={{
                      background: 'var(--info)',
                      height: '100%', borderRadius: 4,
                      width: `${overview.top_events[0]?.revenue > 0 ? Math.round((e.revenue / overview.top_events[0].revenue) * 100) : 0}%`,
                      transition: 'width 0.5s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11, color: 'var(--text3)' }}>
                    <span>{e.total_sold} sold</span>
                    <span>{e.capacity} cap</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Summary table ── */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          Summary
        </div>
        <SummaryRow label="Total events"    value={overview.total_events} />
        <SummaryRow label="Total attendees" value={overview.total_attendees} />
        <SummaryRow label="Tickets issued"  value={overview.total_tickets} />
        <SummaryRow label="Gross revenue"   value={fmtCurrency(overview.gross_revenue)} />
        <SummaryRow label="Net revenue"     value={fmtCurrency(overview.net_revenue)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--text2)' }}>Platform fee</span>
          <strong style={{ color: 'var(--accent2)' }}>
            {fmtCurrency(overview.gross_revenue - overview.net_revenue)}
          </strong>
        </div>
      </div>
    </div>
  );
}
