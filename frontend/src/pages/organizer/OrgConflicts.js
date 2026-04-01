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
  if (event.event_type === 'escalated') return payload.reason || 'Escalated for super admin review';
  return '';
}

export default function OrgConflicts() {
  const [rows, setRows] = useState([]);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('all');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [acting, setActing] = useState(null);
  const { toast } = useToast();

  const selectedTicket = rows.find((row) => row.id === selectedId)
    ? { ...rows.find((row) => row.id === selectedId), viewer_role: 'organizer' }
    : null;

  const load = async ({ preserveSelection = true } = {}) => {
    setLoadingTickets(true);
    try {
      const response = await supportAPI.organizer();
      const tickets = response.data.data || [];
      setRows(tickets);
      setSelectedId((current) => {
        if (preserveSelection && current && tickets.some((ticket) => ticket.id === current)) return current;
        return tickets[0]?.id || null;
      });
    } catch (err) {
      setRows([]);
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
      const response = await supportAPI.messages(ticketId);
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
  }, []);

  useEffect(() => {
    const ticket = rows.find((row) => row.id === selectedId);
    loadMessages(selectedId, { refreshTickets: Number(ticket?.unread_count || 0) > 0 });
    loadEvents(selectedId);
  }, [selectedId]);

  const filtered = rows.filter((row) => status === 'all' || row.status === status);
  const visibleSelected = filtered.find((row) => row.id === selectedId)
    ? { ...filtered.find((row) => row.id === selectedId), viewer_role: 'organizer' }
    : selectedTicket;

  const sendReply = async ({ body }) => {
    if (!visibleSelected) return false;
    setSendingMessage(true);
    try {
      await supportAPI.reply(visibleSelected.id, { body });
      await loadMessages(visibleSelected.id);
      await loadEvents(visibleSelected.id);
      await load();
      return true;
    } catch (err) {
      toast(err.response?.data?.message || 'Reply failed', 'error');
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  const quickReply = async (body) => {
    if (!visibleSelected) return;
    await sendReply({ body });
  };

  const escalate = async () => {
    if (!visibleSelected) return;
    setActing('escalate');
    try {
      await supportAPI.escalate(visibleSelected.id, { reason: 'Organizer requests super admin intervention.' });
      toast(`Ticket ${visibleSelected.ticket_ref} escalated`);
      await load();
      await loadMessages(visibleSelected.id);
      await loadEvents(visibleSelected.id);
    } catch (err) {
      toast(err.response?.data?.message || 'Escalation failed', 'error');
    } finally {
      setActing(null);
    }
  };

  const settle = async (action) => {
    if (!visibleSelected) return;
    setActing(action);
    try {
      const note = action === 'resolved'
        ? 'Organizer marked this issue resolved after follow-up with the customer.'
        : 'Organizer could not resolve this issue and requests super admin intervention.';
      await supportAPI.organizerSettle(visibleSelected.id, { action, note });
      toast(action === 'resolved' ? 'Marked as resolved' : 'Escalated to super admin');
      await load();
      await loadMessages(visibleSelected.id);
      await loadEvents(visibleSelected.id);
    } catch (err) {
      toast(err.response?.data?.message || 'Settlement failed', 'error');
    } finally {
      setActing(null);
    }
  };

  return (
    <SupportInbox
      title="Event Support"
      subtitle="WhatsApp-style workspace for customer issues linked to your events."
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
      draftPlaceholder="Reply to the customer or leave the settlement context here…"
      composerActions={visibleSelected ? (
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => quickReply('We are verifying this with the event team and will respond shortly.')}>
            Acknowledge
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => quickReply('Please confirm the attendee name, phone number, and the original payment message so we can verify the order.')}>
            Request details
          </button>
        </>
      ) : null}
      roleLabels={{ organizer: 'You', admin: 'Super Admin', user: 'Customer', guest: 'Customer' }}
      filters={(
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%' }}>
          <option value="all">All statuses</option>
          <option value="waiting_organizer">Waiting Organizer</option>
          <option value="escalated">Escalated</option>
          <option value="in_review">In Review</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      )}
      ticketMeta={(ticket) => (
        ticket.user_email ? <Badge variant="gray">{ticket.user_email}</Badge> : null
      )}
      threadMeta={(ticket) => (
        <>
          {ticket.order_ref && <Badge variant="gray">{ticket.order_ref}</Badge>}
          {ticket.sla_state && <Badge variant={ticket.sla_state === 'overdue' ? 'red' : ticket.sla_state === 'due_soon' ? 'yellow' : 'blue'}>{ticket.sla_state}</Badge>}
        </>
      )}
      threadActions={visibleSelected ? (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => settle('resolved')} disabled={acting !== null}>
            {acting === 'resolved' ? <><i data-lucide="loader-2" style={{ width: 13, height: 13 }} /> Saving…</> : 'Resolve'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={escalate} disabled={acting !== null}>
            {acting === 'escalate' ? <><i data-lucide="loader-2" style={{ width: 13, height: 13 }} /> Escalating…</> : 'Escalate'}
          </button>
        </>
      ) : null}
      sidebarFooter={(
        <>
          <div className="support-kpi-grid">
            <div className="support-kpi">
              <div className="support-kpi-label">Waiting</div>
              <div className="support-kpi-value">{rows.filter((row) => row.status === 'waiting_organizer').length}</div>
            </div>
            <div className="support-kpi">
              <div className="support-kpi-label">Escalated</div>
              <div className="support-kpi-value">{rows.filter((row) => row.escalation_level > 0).length}</div>
            </div>
          </div>
          <div className="support-info-card">
            <div className="support-info-title">Organizer workflow</div>
            <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.7 }}>
              Reply in-thread for normal cases. Use Resolve when you have settled the issue directly with the attendee.
              Escalate only when payment reversals, fraud signals, or policy disputes need platform intervention.
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
              Customer: <strong style={{ color: 'var(--text)' }}>{visibleSelected.user_email || 'Guest'}</strong><br />
              Category: <strong style={{ color: 'var(--text)' }}>{visibleSelected.category}</strong><br />
              Order ref: <strong style={{ color: 'var(--text)' }}>{visibleSelected.order_ref || 'N/A'}</strong>
            </div>
          </div>
          <div className="support-info-card">
            <div className="support-info-title">Activity</div>
            {loadingEvents ? (
              <div style={{ color: 'var(--text2)', fontSize: 12 }}>Loading activity…</div>
            ) : (
              <div className="support-timeline">
                {events.slice(-8).reverse().map((event) => (
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
