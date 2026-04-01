import React, { useEffect, useState } from 'react';
import SupportInbox from '../../components/ui/SupportInbox';
import { Badge } from '../../components/ui';
import { supportAPI } from '../../api/client';
import { useToast } from '../../components/ui';

const EVENT_LABELS = {
  ticket_created: 'Ticket opened',
  message_posted: 'New reply',
  status_changed: 'Status changed',
  priority_changed: 'Priority updated',
  assignment_changed: 'Assignment changed',
  escalated: 'Escalated',
};

function formatEventText(event) {
  const payload = event.payload || {};
  if (event.event_type === 'status_changed') return `${payload.from || 'unknown'} -> ${payload.to || 'unknown'}`;
  if (event.event_type === 'priority_changed') return `${payload.from || 'unknown'} -> ${payload.to || 'unknown'}`;
  if (event.event_type === 'assignment_changed') return `${payload.from || 'unassigned'} -> ${payload.to || 'assigned'}`;
  if (event.event_type === 'escalated') return payload.reason || 'Escalated for admin review';
  return '';
}

export default function AdminConflicts() {
  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState(null);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const [escalatedOnly, setEscalatedOnly] = useState(true);
  const [showInternal, setShowInternal] = useState(false);
  const [postInternal, setPostInternal] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [acting, setActing] = useState(null);
  const { toast } = useToast();

  const selectedTicket = rows.find((row) => row.id === selectedId)
    ? { ...rows.find((row) => row.id === selectedId), viewer_role: 'admin' }
    : null;

  const load = async ({ preserveSelection = true } = {}) => {
    setLoadingTickets(true);
    try {
      const [response, overviewResponse] = await Promise.all([
        supportAPI.adminConflicts({
          ...(status !== 'all' && { status }),
          escalated_only: escalatedOnly,
        }),
        supportAPI.adminOverview(),
      ]);
      const tickets = response.data.data || [];
      setRows(tickets);
      setOverview(overviewResponse.data.data || null);
      setSelectedId((current) => {
        if (preserveSelection && current && tickets.some((ticket) => ticket.id === current)) return current;
        return tickets[0]?.id || null;
      });
    } catch (err) {
      setRows([]);
      setOverview(null);
      toast(err.response?.data?.message || 'Failed to load conflicts', 'error');
    } finally {
      setLoadingTickets(false);
    }
  };

  const loadMessages = async (ticketId, { refreshTickets = false } = {}) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const response = await supportAPI.messages(ticketId, { include_internal: showInternal });
      setMessages(response.data.data || []);
      if (refreshTickets) await load();
    } catch (err) {
      setMessages([]);
      toast(err.response?.data?.message || 'Failed to load conversation', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadEvents = async (ticketId) => {
    if (!ticketId) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    try {
      const response = await supportAPI.events(ticketId);
      setEvents(response.data.data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    load({ preserveSelection: false });
  }, [status, escalatedOnly]);

  useEffect(() => {
    const ticket = rows.find((row) => row.id === selectedId);
    loadMessages(selectedId, { refreshTickets: Number(ticket?.unread_count || 0) > 0 });
    loadEvents(selectedId);
  }, [selectedId, showInternal]);

  const filtered = rows.filter((row) => owner === 'all' || row.owner_lane === owner);
  const visibleSelected = filtered.find((row) => row.id === selectedId)
    ? { ...filtered.find((row) => row.id === selectedId), viewer_role: 'admin' }
    : selectedTicket;

  const sendReply = async ({ body }) => {
    if (!visibleSelected) return false;
    setSendingMessage(true);
    try {
      await supportAPI.reply(visibleSelected.id, { body, is_internal: postInternal });
      await loadMessages(visibleSelected.id);
      await loadEvents(visibleSelected.id);
      await load();
      if (postInternal) toast('Internal note saved');
      return true;
    } catch (err) {
      toast(err.response?.data?.message || 'Reply failed', 'error');
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  const quickReply = async (body, internal = false) => {
    if (!visibleSelected) return;
    const previous = postInternal;
    if (internal) setPostInternal(true);
    const ok = await sendReply({ body });
    if (internal) setPostInternal(previous);
    return ok;
  };

  const intervene = async (nextStatus) => {
    if (!visibleSelected) return;
    setActing(nextStatus);
    try {
      await supportAPI.intervene(visibleSelected.id, {
        status: nextStatus,
        priority: visibleSelected.escalation_level > 1 ? 'urgent' : visibleSelected.priority,
        resolution_note: nextStatus === 'resolved'
          ? 'Resolved by super admin intervention.'
          : 'Super admin has taken ownership of this thread.',
      });
      toast(`Ticket ${visibleSelected.ticket_ref} updated`);
      await load();
      await loadMessages(visibleSelected.id);
      await loadEvents(visibleSelected.id);
    } catch (err) {
      toast(err.response?.data?.message || 'Intervention failed', 'error');
    } finally {
      setActing(null);
    }
  };

  const stats = filtered.reduce((acc, row) => {
    acc.total += 1;
    acc[row.owner_lane] = (acc[row.owner_lane] || 0) + 1;
    if (row.sla_state === 'overdue') acc.overdue += 1;
    return acc;
  }, { total: 0, super_admin: 0, organizer: 0, overdue: 0 });

  const overviewMetrics = overview?.metrics || {};
  const overviewLanes = overview?.lanes || {};

  return (
    <SupportInbox
      title="Conflict Escalations"
      subtitle="Central admin inbox for every organizer and customer support thread."
      tickets={filtered}
      loadingTickets={loadingTickets}
      selectedTicket={visibleSelected}
      onSelectTicket={(ticket) => setSelectedId(ticket.id)}
      messages={messages}
      loadingMessages={loadingMessages}
      onRefresh={() => {
        load();
        loadMessages(selectedId);
        loadEvents(selectedId);
      }}
      onSendMessage={sendReply}
      sendingMessage={sendingMessage}
      draftPlaceholder="Reply as super admin and keep the customer, organizer, and policy decision in one thread…"
      composerActions={visibleSelected ? (
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => quickReply('We have taken ownership of this case and are reviewing the transaction and organizer history now.')}>
            Take ownership
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => quickReply('Internal note: risk and payment verification pending before final buyer response.', true)}>
            Internal note
          </button>
        </>
      ) : null}
      roleLabels={{ admin: 'You', organizer: 'Organizer', user: 'Customer', guest: 'Customer' }}
      composerMeta={(
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: postInternal ? 'var(--info)' : 'var(--text2)',
          padding: '8px 10px',
          borderRadius: 10,
          background: postInternal ? 'rgba(59,130,246,0.12)' : 'var(--surface2)',
          border: `1px solid ${postInternal ? 'rgba(59,130,246,0.25)' : 'var(--border)'}`,
        }}>
          <input type="checkbox" checked={postInternal} onChange={(e) => setPostInternal(e.target.checked)} />
          Save as internal note
        </label>
      )}
      filters={(
        <>
          <select className="select" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
            <option value="all">All owners</option>
            <option value="super_admin">Super Admin</option>
            <option value="organizer">Organizer</option>
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
            <option value="all">All statuses</option>
            <option value="escalated">Escalated</option>
            <option value="in_review">In Review</option>
            <option value="waiting_organizer">Waiting Organizer</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <button className={`btn btn-sm ${escalatedOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEscalatedOnly((value) => !value)}>
            Escalated {escalatedOnly ? 'ON' : 'OFF'}
          </button>
          <button className={`btn btn-sm ${showInternal ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowInternal((value) => !value)}>
            Internal {showInternal ? 'ON' : 'OFF'}
          </button>
        </>
      )}
      ticketMeta={(ticket) => (
        <>
          {ticket.owner_lane && <Badge variant={ticket.owner_lane === 'organizer' ? 'yellow' : 'red'}>{ticket.owner_lane}</Badge>}
          {ticket.organizer_name && <Badge variant="gray">{ticket.organizer_name}</Badge>}
        </>
      )}
      threadMeta={(ticket) => (
        <>
          {ticket.order_ref && <Badge variant="gray">{ticket.order_ref}</Badge>}
          {ticket.sla_state && <Badge variant={ticket.sla_state === 'overdue' ? 'red' : ticket.sla_state === 'due_soon' ? 'yellow' : 'blue'}>{ticket.sla_state}</Badge>}
          {ticket.user_email && <Badge variant="gray">{ticket.user_email}</Badge>}
        </>
      )}
      threadActions={visibleSelected ? (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => intervene('in_review')} disabled={acting !== null}>
            {acting === 'in_review' ? <><i data-lucide="loader-2" style={{ width: 13, height: 13 }} /> Saving…</> : 'Review'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => intervene('resolved')} disabled={acting !== null}>
            {acting === 'resolved' ? <><i data-lucide="loader-2" style={{ width: 13, height: 13 }} /> Resolving…</> : 'Resolve'}
          </button>
        </>
      ) : null}
      sidebarFooter={(
        <>
          <div className="support-kpi-grid">
            <div className="support-kpi">
              <div className="support-kpi-label">Open</div>
              <div className="support-kpi-value">{overviewMetrics.open ?? stats.total}</div>
            </div>
            <div className="support-kpi">
              <div className="support-kpi-label">Overdue</div>
              <div className="support-kpi-value">{overviewMetrics.overdue ?? stats.overdue}</div>
            </div>
            <div className="support-kpi">
              <div className="support-kpi-label">Unread</div>
              <div className="support-kpi-value">{overviewMetrics.unread_total ?? 0}</div>
            </div>
            <div className="support-kpi">
              <div className="support-kpi-label">Escalated</div>
              <div className="support-kpi-value">{overviewMetrics.escalated ?? 0}</div>
            </div>
          </div>
          <div className="support-info-card">
            <div className="support-info-title">Ownership split</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant="red">Super Admin {(overviewLanes.super_admin ?? stats.super_admin) || 0}</Badge>
              <Badge variant="yellow">Organizer {(overviewLanes.organizer ?? stats.organizer) || 0}</Badge>
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.7, marginTop: 10 }}>
              Use Review to pull a thread into the admin lane. Resolve only after the final buyer-facing answer and any platform action have both been recorded.
            </div>
          </div>
        </>
      )}
      threadSidebar={visibleSelected && (
        <>
          <div className="support-kpi-grid">
            <div className="support-kpi">
              <div className="support-kpi-label">Replies</div>
              <div className="support-kpi-value">{visibleSelected.message_count || messages.length}</div>
            </div>
            <div className="support-kpi">
              <div className="support-kpi-label">Escalation</div>
              <div className="support-kpi-value">L{visibleSelected.escalation_level || 0}</div>
            </div>
          </div>
          <div className="support-info-card">
            <div className="support-info-title">Case context</div>
            <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.8 }}>
              Buyer: <strong style={{ color: 'var(--text)' }}>{visibleSelected.user_email || 'Guest'}</strong><br />
              Organizer: <strong style={{ color: 'var(--text)' }}>{visibleSelected.organizer_name || 'N/A'}</strong><br />
              Category: <strong style={{ color: 'var(--text)' }}>{visibleSelected.category}</strong><br />
              Owner lane: <strong style={{ color: 'var(--text)' }}>{visibleSelected.owner_lane}</strong>
            </div>
          </div>
          <div className="support-info-card">
            <div className="support-info-title">Activity</div>
            {loadingEvents ? (
              <div style={{ color: 'var(--text2)', fontSize: 12 }}>Loading activity…</div>
            ) : (
              <div className="support-timeline">
                {events.slice(-10).reverse().map((event) => (
                  <div key={event.id} className="support-timeline-item">
                    <div className="support-timeline-title">{EVENT_LABELS[event.event_type] || event.event_type}</div>
                    <div className="support-timeline-meta">
                      {(event.actor_name || event.actor_role || 'system')} · {new Date(event.created_at).toLocaleString('en-KE')}
                    </div>
                    {formatEventText(event) && <div className="support-timeline-body">{formatEventText(event)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    />
  );
}
