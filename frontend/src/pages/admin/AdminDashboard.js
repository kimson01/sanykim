// src/pages/admin/AdminDashboard.js
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminAPI, supportAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

const ADMIN_ROUTES = {
  dashboard: '/admin',
  organizers: '/admin/organizers',
  organizersPending: '/admin/organizers?status=pending',
  events: '/admin/events',
  transactions: '/admin/transactions',
  conflicts: '/admin/conflicts',
};

const DASHBOARD_DEFAULTS = {
  stats: {
    total_events: 0,
    total_organizers: 0,
    total_tickets_sold: 0,
    total_users: 0,
    gross_revenue: 0,
    platform_revenue: 0,
    pending_organizers: 0,
    today_orders: 0,
    today_revenue: 0,
    week_orders: 0,
    week_revenue: 0,
  },
  recent_orders: [],
  top_events: [],
  pending_org_details: [],
  top_organizers: [],
  daily_revenue: [],
  monthly_revenue: [],
  order_breakdown: [],
};

function normalizeDashboardPayload(payload) {
  const source = payload?.data?.data || payload?.data || payload || {};
  return {
    ...DASHBOARD_DEFAULTS,
    ...source,
    stats: {
      ...DASHBOARD_DEFAULTS.stats,
      ...(source.stats || source),
    },
    recent_orders: Array.isArray(source.recent_orders) ? source.recent_orders : [],
    top_events: Array.isArray(source.top_events) ? source.top_events : [],
    pending_org_details: Array.isArray(source.pending_org_details) ? source.pending_org_details : [],
    top_organizers: Array.isArray(source.top_organizers) ? source.top_organizers : [],
    daily_revenue: Array.isArray(source.daily_revenue) ? source.daily_revenue : [],
    monthly_revenue: Array.isArray(source.monthly_revenue) ? source.monthly_revenue : [],
    order_breakdown: Array.isArray(source.order_breakdown) ? source.order_breakdown : [],
  };
}

function normalizeSupportOverview(payload) {
  const source = payload?.data?.data || payload?.data || payload || {};
  return {
    ...source,
    metrics: source?.metrics || {},
    lanes: source?.lanes || {},
  };
}

function MiniBar({ data, valueKey, tone = 'gold', labelFormatter, valueFormatter }) {
  if (!data?.length) return <div className="admin-dashboard-chart-empty">No data yet</div>;

  const max = Math.max(...data.map((item) => Number(item[valueKey]) || 0), 1);

  return (
    <div className={`admin-dashboard-chart admin-dashboard-chart-${tone}`}>
      {data.map((item, index) => {
        const rawValue = Number(item[valueKey]) || 0;
        const label = labelFormatter ? labelFormatter(item) : '';
        const value = valueFormatter ? valueFormatter(rawValue, item) : rawValue;
        const height = Math.max(Math.round((rawValue / max) * 100), 6);

        return (
          <div
            key={item.day || item.month || index}
            className="admin-dashboard-chart-bar"
            style={{ height: `${height}%` }}
            title={label ? `${label}: ${value}` : String(value)}
          />
        );
      })}
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle, actionLabel, actionTo }) {
  return (
    <div className="admin-dashboard-section-head">
      <div>
        {eyebrow && <div className="admin-dashboard-eyebrow">{eyebrow}</div>}
        <h2 className="admin-dashboard-section-title">{title}</h2>
        {subtitle && <p className="admin-dashboard-section-subtitle">{subtitle}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="admin-dashboard-section-link">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function PendingOrgRow({ org, onApprove }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const approve = async () => {
    setLoading(true);
    try {
      await adminAPI.updateOrgStatus(org.id, 'approved');
      toast(`${org.company_name} approved`);
      onApprove();
    } catch {
      toast('Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-dashboard-list-row">
      <div className="avatar avatar-orange admin-dashboard-list-avatar">
        {org.name?.[0] || org.company_name?.[0] || 'O'}
      </div>
      <div className="admin-dashboard-list-main">
        <div className="admin-dashboard-list-title">{org.company_name}</div>
        <div className="admin-dashboard-list-meta">
          {org.name} • Applied {fmtDate(org.created_at)}
        </div>
      </div>
      <div className="admin-dashboard-list-actions">
        <button className="btn btn-primary btn-sm" onClick={approve} disabled={loading}>
          {loading ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} /> : 'Approve'}
        </button>
        <Link to={ADMIN_ROUTES.organizers} className="btn btn-ghost btn-sm">
          Review
        </Link>
      </div>
    </div>
  );
}

function TransactionRow({ order }) {
  return (
    <div className="admin-dashboard-list-row admin-dashboard-list-row-compact">
      <div className="admin-dashboard-transaction-amount">
        <strong>{fmtCurrency(order.total)}</strong>
        <span>{fmtDate(order.created_at)}</span>
      </div>
      <div className="admin-dashboard-list-main">
        <div className="admin-dashboard-list-title">{order.event_title}</div>
        <div className="admin-dashboard-list-meta">
          {order.attendee_name} • {order.order_ref}
        </div>
      </div>
      <div className="admin-dashboard-transaction-tags">
        <Badge variant="blue">{(order.payment_method || 'mpesa').toUpperCase()}</Badge>
        <Badge
          variant={
            order.status === 'success'
              ? 'green'
              : order.status === 'pending'
                ? 'yellow'
                : order.status === 'refunded'
                  ? 'orange'
                  : 'red'
          }
        >
          {order.status}
        </Badge>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [supportOverview, setSupportOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.allSettled([adminAPI.dashboard(), supportAPI.adminOverview()])
      .then(([dashboardResult, supportResult]) => {
        if (dashboardResult.status !== 'fulfilled') {
          setData(null);
          setSupportOverview(null);
          toast(
            dashboardResult.reason?.response?.data?.message || 'Failed to load dashboard data',
            'error'
          );
          return;
        }

        setData(normalizeDashboardPayload(dashboardResult.value));

        if (supportResult.status === 'fulfilled') {
          setSupportOverview(normalizeSupportOverview(supportResult.value));
        } else {
          setSupportOverview(null);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Run once on mount; `toast` is not stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="admin-dashboard-state">
        <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  if (!data) return null;

  const stats = data?.stats || DASHBOARD_DEFAULTS.stats;
  const recentOrders = data?.recent_orders || DASHBOARD_DEFAULTS.recent_orders;
  const topEvents = data?.top_events || DASHBOARD_DEFAULTS.top_events;
  const pendingOrgDetails = data?.pending_org_details || DASHBOARD_DEFAULTS.pending_org_details;
  const topOrganizers = data?.top_organizers || DASHBOARD_DEFAULTS.top_organizers;
  const dailyRevenue = data?.daily_revenue || DASHBOARD_DEFAULTS.daily_revenue;
  const monthlyRevenue = data?.monthly_revenue || DASHBOARD_DEFAULTS.monthly_revenue;
  const orderBreakdown = data?.order_breakdown || DASHBOARD_DEFAULTS.order_breakdown;

  const orderStatus = (status) => {
    const row = orderBreakdown.find((item) => item.status === status);
    return {
      count: parseInt(row?.total || 0, 10),
      revenue: parseFloat(row?.revenue || 0),
    };
  };

  const successOrders = orderStatus('success');
  const pendingOrders = orderStatus('pending');
  const refundedOrders = orderStatus('refunded');
  const supportMetrics = supportOverview?.metrics || {};
  const supportLanes = supportOverview?.lanes || {};
  const revenue14d = dailyRevenue.reduce((sum, item) => sum + parseFloat(item?.revenue || 0), 0);
  const orders14d = dailyRevenue.reduce((sum, item) => sum + parseInt(item?.orders || 0, 10), 0);
  const totalSupportAttention = (supportMetrics.escalated || 0) + (supportMetrics.overdue || 0);
  const activityDateLabel =
    dailyRevenue.length > 0
      ? new Date(dailyRevenue[0].day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
      : '';

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-policy">
        <i data-lucide="info" style={{ width: 14, height: 14 }} />
        <span>Admin accounts cannot buy tickets. Use a separate attendee account for test or real purchases.</span>
      </div>

      <section className="admin-dashboard-hero">
        <div className="admin-dashboard-hero-main">
          <div className="admin-dashboard-eyebrow">Platform overview</div>
          <h1 className="admin-dashboard-hero-title">Admin dashboard</h1>
          <p className="admin-dashboard-hero-copy">
            Review approvals, monitor conflicts, and track revenue from one place.
          </p>

          <div className="admin-dashboard-hero-actions">
            <Link to={ADMIN_ROUTES.organizersPending} className="btn btn-primary">
              <i data-lucide="shield-check" style={{ width: 14, height: 14 }} /> Review organizers
            </Link>
            <Link to={ADMIN_ROUTES.conflicts} className="btn btn-secondary">
              <i data-lucide="messages-square" style={{ width: 14, height: 14 }} /> View conflicts
            </Link>
          </div>

          <div className="admin-dashboard-snapshot-grid">
            <div className="admin-dashboard-snapshot">
              <span>Platform revenue</span>
              <strong>{fmtCurrency(stats.platform_revenue || 0)}</strong>
              <small>From {fmtCurrency(stats.gross_revenue || 0)} gross</small>
            </div>
            <div className="admin-dashboard-snapshot">
              <span>Tickets sold</span>
              <strong>{(stats.total_tickets_sold || 0).toLocaleString()}</strong>
              <small>Across {stats.total_events || 0} events</small>
            </div>
            <div className="admin-dashboard-snapshot">
              <span>People on platform</span>
              <strong>{(stats.total_users || 0).toLocaleString()}</strong>
              <small>{stats.total_organizers || 0} active organizers</small>
            </div>
          </div>
        </div>

        <div className="admin-dashboard-hero-side">
          <div className="admin-dashboard-priority-card">
            <div className="admin-dashboard-priority-kicker">Needs attention now</div>
            <div className="admin-dashboard-priority-value">
              {(stats.pending_organizers || 0) + totalSupportAttention}
            </div>
            <p className="admin-dashboard-priority-copy">
              Pending approvals, overdue cases, and unsettled payments need follow-up first.
            </p>

            <div className="admin-dashboard-priority-list">
              <button
                type="button"
                className="admin-dashboard-priority-item"
                onClick={() => navigate(ADMIN_ROUTES.organizersPending)}
              >
                <div>
                  <strong>{stats.pending_organizers || 0}</strong>
                  <span>organizer applications</span>
                </div>
                <i data-lucide="arrow-right" style={{ width: 14, height: 14 }} />
              </button>
              <button
                type="button"
                className="admin-dashboard-priority-item"
                onClick={() => navigate(ADMIN_ROUTES.conflicts)}
              >
                <div>
                  <strong>{supportMetrics.overdue || 0}</strong>
                  <span>overdue conflict cases</span>
                </div>
                <i data-lucide="arrow-right" style={{ width: 14, height: 14 }} />
              </button>
              <button
                type="button"
                className="admin-dashboard-priority-item"
                onClick={() => navigate(ADMIN_ROUTES.transactions)}
              >
                <div>
                  <strong>{pendingOrders.count}</strong>
                  <span>pending payments</span>
                </div>
                <i data-lucide="arrow-right" style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="admin-dashboard-grid admin-dashboard-grid-priority">
        <section className="admin-dashboard-panel admin-dashboard-panel-warm">
          <SectionHead
            eyebrow="What needs action"
            title={`Organizer approvals${stats.pending_organizers ? ` (${stats.pending_organizers})` : ''}`}
            subtitle="Review pending organizer accounts."
            actionLabel="All organizers"
            actionTo={ADMIN_ROUTES.organizers}
          />

          {pendingOrgDetails.length === 0 ? (
            <div className="admin-dashboard-empty">
              <i data-lucide="check-circle" style={{ width: 18, height: 18 }} />
              <span>All applications are currently reviewed.</span>
            </div>
          ) : (
            <div className="admin-dashboard-list">
              {pendingOrgDetails.map((org) => (
                <PendingOrgRow key={org.id} org={org} onApprove={load} />
              ))}
            </div>
          )}
        </section>

        <section className="admin-dashboard-panel">
          <SectionHead
            eyebrow="Support pressure"
            title="Inbox health"
            subtitle="Watch case volume, escalations, and unread work."
            actionLabel="Open conflicts"
            actionTo={ADMIN_ROUTES.conflicts}
          />

          <div className="admin-dashboard-pill-grid">
            <div className="admin-dashboard-pill-card">
              <span>Open threads</span>
              <strong>{(supportMetrics.open || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-dashboard-pill-card admin-dashboard-pill-card-danger">
              <span>Escalated</span>
              <strong>{(supportMetrics.escalated || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-dashboard-pill-card admin-dashboard-pill-card-warning">
              <span>Overdue</span>
              <strong>{(supportMetrics.overdue || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-dashboard-pill-card admin-dashboard-pill-card-info">
              <span>Unread</span>
              <strong>{(supportMetrics.unread_total || 0).toLocaleString()}</strong>
            </div>
          </div>

          <div className="admin-dashboard-lane-row">
            <Badge variant="red">Super Admin {supportLanes.super_admin || 0}</Badge>
            <Badge variant="yellow">Organizer {supportLanes.organizer || 0}</Badge>
            <Badge variant="blue">Due Soon {supportMetrics.due_soon || 0}</Badge>
            <Badge variant="gray">Resolved {supportMetrics.resolved || 0}</Badge>
          </div>

          <div className="admin-dashboard-note">
            High escalations or overdue cases mean the conflicts queue needs attention.
          </div>
        </section>
      </div>

      <div className="admin-dashboard-grid">
        <section className="admin-dashboard-panel admin-dashboard-panel-feature">
          <SectionHead
            eyebrow="How the platform is performing"
            title="Revenue pulse"
            subtitle="Recent revenue, order volume, and payment status."
          />

          <div className="admin-dashboard-performance-head">
            <div>
              <div className="admin-dashboard-performance-value">{fmtCurrency(revenue14d)}</div>
              <div className="admin-dashboard-performance-meta">Last 14 days • {orders14d} orders</div>
            </div>
            <div className="admin-dashboard-performance-side">
              <span>This week</span>
              <strong>{fmtCurrency(stats.week_revenue || 0)}</strong>
              <small>{stats.week_orders || 0} orders</small>
            </div>
          </div>

          <MiniBar
            data={dailyRevenue}
            valueKey="revenue"
            tone="gold"
            labelFormatter={(item) =>
              item.day
                ? new Date(item.day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
                : ''
            }
            valueFormatter={(value) => fmtCurrency(value)}
          />

          <div className="admin-dashboard-chart-caption">
            <span>{activityDateLabel || 'Recent period'}</span>
            <span>Today</span>
          </div>

          <div className="admin-dashboard-commerce-grid">
            <div className="admin-dashboard-commerce-item">
              <span>Successful orders</span>
              <strong>{successOrders.count.toLocaleString()}</strong>
              <small>{fmtCurrency(successOrders.revenue)}</small>
            </div>
            <div className="admin-dashboard-commerce-item">
              <span>Pending orders</span>
              <strong>{pendingOrders.count.toLocaleString()}</strong>
              <small>{fmtCurrency(pendingOrders.revenue)}</small>
            </div>
            <div className="admin-dashboard-commerce-item">
              <span>Refunded orders</span>
              <strong>{refundedOrders.count.toLocaleString()}</strong>
              <small>{fmtCurrency(refundedOrders.revenue)}</small>
            </div>
            <div className="admin-dashboard-commerce-item">
              <span>Today</span>
              <strong>{fmtCurrency(stats.today_revenue || 0)}</strong>
              <small>{stats.today_orders || 0} orders today</small>
            </div>
          </div>
        </section>

        <section className="admin-dashboard-panel">
          <SectionHead
            eyebrow="Longer view"
            title="Six-month revenue arc"
            subtitle="Monthly revenue trend over the last six months."
          />

          <MiniBar
            data={monthlyRevenue}
            valueKey="revenue"
            tone="teal"
            labelFormatter={(item) =>
              item.month
                ? new Date(item.month).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
                : ''
            }
            valueFormatter={(value) => fmtCurrency(value)}
          />

          <div className="admin-dashboard-metric-stack">
            <div className="admin-dashboard-metric-row">
              <span>Gross revenue</span>
              <strong>{fmtCurrency(stats.gross_revenue || 0)}</strong>
            </div>
            <div className="admin-dashboard-metric-row">
              <span>Platform revenue</span>
              <strong>{fmtCurrency(stats.platform_revenue || 0)}</strong>
            </div>
            <div className="admin-dashboard-metric-row">
              <span>Events live</span>
              <strong>{(stats.total_events || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-dashboard-metric-row">
              <span>Total users</span>
              <strong>{(stats.total_users || 0).toLocaleString()}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="admin-dashboard-grid">
        <section className="admin-dashboard-panel">
          <SectionHead
            eyebrow="Who is driving activity"
            title="Top events by revenue"
            subtitle="Best-performing events right now."
            actionLabel="All events"
            actionTo={ADMIN_ROUTES.events}
          />

          {topEvents.length === 0 ? (
            <div className="admin-dashboard-empty">
              <i data-lucide="calendar-x" style={{ width: 18, height: 18 }} />
              <span>No published events yet.</span>
            </div>
          ) : (
            <div className="admin-dashboard-list">
              {topEvents.map((event, index) => (
                <div key={event.id || index} className="admin-dashboard-list-row">
                  <div className="admin-dashboard-rank">{index + 1}</div>
                  <div className="admin-dashboard-list-main">
                    <div className="admin-dashboard-list-title">{event.title}</div>
                    <div className="admin-dashboard-list-meta">
                      {fmtDate(event.event_date)} • {event.total_sold}/{event.capacity} sold
                    </div>
                  </div>
                  <div className="admin-dashboard-list-value">
                    <strong>{fmtCurrency(event.revenue)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-dashboard-panel">
          <SectionHead
            eyebrow="Who is driving activity"
            title="Top organizers"
            subtitle="Organizers generating the most revenue."
            actionLabel="All organizers"
            actionTo={ADMIN_ROUTES.organizers}
          />

          {topOrganizers.length === 0 ? (
            <div className="admin-dashboard-empty">
              <i data-lucide="users" style={{ width: 18, height: 18 }} />
              <span>No organizer data yet.</span>
            </div>
          ) : (
            <div className="admin-dashboard-list">
              {topOrganizers.map((organizer, index) => (
                <div key={organizer.id || index} className="admin-dashboard-list-row">
                  <div className="admin-dashboard-rank">{index + 1}</div>
                  <div className="admin-dashboard-list-main">
                    <div className="admin-dashboard-list-title">{organizer.company_name}</div>
                    <div className="admin-dashboard-list-meta">
                      {organizer.event_count} events • {organizer.commission}% commission
                    </div>
                  </div>
                  <div className="admin-dashboard-list-value">
                    <strong>{fmtCurrency(organizer.total_revenue)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="admin-dashboard-panel">
        <SectionHead
          eyebrow="What just happened"
          title="Recent transactions"
          subtitle="Latest payment activity and order status."
          actionLabel="View all transactions"
          actionTo={ADMIN_ROUTES.transactions}
        />

        {recentOrders.length === 0 ? (
          <div className="admin-dashboard-empty">
            <i data-lucide="receipt" style={{ width: 18, height: 18 }} />
            <span>No orders yet.</span>
          </div>
        ) : (
          <div className="admin-dashboard-list">
            {recentOrders.map((order) => (
              <TransactionRow key={order.id || order.order_ref} order={order} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
