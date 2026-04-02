import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SanyLogo from '../../components/ui/Logo';
import SupportInbox from '../../components/ui/SupportInbox';
import { Badge, EmptyState } from '../../components/ui';
import { settingsAPI, supportAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const FAQS = [
  {
    q: 'I paid but did not receive my ticket. What should I do?',
    a: 'Open a ticket with your order reference and M-PESA message. Payment and ticket issues are prioritized automatically.',
  },
  {
    q: 'How long do refunds take?',
    a: 'Approved M-PESA reversals usually move quickly. Bank and card reversals depend on provider settlement cycles.',
  },
  {
    q: 'Can I transfer my ticket to someone else?',
    a: 'Transfer depends on organizer policy. Support can confirm eligibility and update the ticket holder details where allowed.',
  },
];

const ORDER_CATEGORIES = new Set(['tickets', 'payments', 'refunds']);

const EVENT_LABELS = {
  ticket_created: 'Ticket opened',
  message_posted: 'New reply',
  status_changed: 'Status changed',
  priority_changed: 'Priority updated',
  assignment_changed: 'Assignment changed',
  escalated: 'Escalated',
  ticket_deleted: 'Ticket removed',
};

function formatEventText(event) {
  const payload = event.payload || {};
  if (event.event_type === 'status_changed') return `${payload.from || 'unknown'} -> ${payload.to || 'unknown'}`;
  if (event.event_type === 'priority_changed') return `${payload.from || 'unknown'} -> ${payload.to || 'unknown'}`;
  if (event.event_type === 'assignment_changed') return `${payload.from || 'unassigned'} -> ${payload.to || 'assigned'}`;
  if (event.event_type === 'escalated') return payload.reason || 'Escalated for admin review';
  return payload.previous_status || '';
}

export default function CustomerCarePage() {
  const { user } = useAuth();
  const [supportEmail, setSupportEmail] = useState('support@sanyadventures.com');
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    category: 'tickets',
    order_ref: '',
    subject: '',
    message: '',
  });

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId)
    ? { ...tickets.find((ticket) => ticket.id === selectedId), viewer_role: 'user' }
    : null;

  const loadTickets = async ({ preserveSelection = true } = {}) => {
    if (!user) return;
    setLoadingTickets(true);
    try {
      const response = await supportAPI.my();
      const rows = response.data.data || [];
      setTickets(rows);
      setSelectedId((current) => {
        if (preserveSelection && current && rows.some((ticket) => ticket.id === current)) return current;
        return rows[0]?.id || null;
      });
    } catch (err) {
      setTickets([]);
      setError(err.response?.data?.message || 'Could not load your tickets');
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
      if (refreshTickets) await loadTickets();
    } catch (err) {
      setMessages([]);
      setError(err.response?.data?.message || 'Could not load the conversation');
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
    settingsAPI.public()
      .then((response) => {
        const email = response?.data?.data?.support_email;
        if (email) setSupportEmail(email);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name: user?.name || current.name,
      email: user?.email || current.email,
    }));
  }, [user]);

  useEffect(() => {
    loadTickets({ preserveSelection: false });
  }, [user]);

  useEffect(() => {
    const ticket = tickets.find((row) => row.id === selectedId);
    loadMessages(selectedId, { refreshTickets: Number(ticket?.unread_count || 0) > 0 });
    loadEvents(selectedId);
  }, [selectedId]);

  const onChange = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submitTicket = async (event) => {
    event.preventDefault();
    setError('');
    setDone(null);
    if (ORDER_CATEGORIES.has(form.category) && !form.order_ref.trim()) {
      setError('Order reference is required for ticket, payment, and refund issues.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await supportAPI.submit(form);
      setDone(response?.data?.data || null);
      setForm((current) => ({ ...current, order_ref: '', subject: '', message: '' }));
      await loadTickets({ preserveSelection: false });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async ({ body }) => {
    if (!selectedTicket) return false;
    setError('');
    setSendingMessage(true);
    try {
      await supportAPI.reply(selectedTicket.id, { body });
      await loadMessages(selectedTicket.id);
      await loadEvents(selectedTicket.id);
      await loadTickets();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send reply');
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  const quickReply = async (body) => {
    if (!selectedTicket) return;
    await sendReply({ body });
  };

  const escalate = async () => {
    if (!selectedTicket) return;
    setError('');
    setEscalating(true);
    try {
      await supportAPI.escalate(selectedTicket.id, {
        reason: 'Customer requested super admin intervention from the help center.',
      });
      await loadTickets();
      await loadMessages(selectedTicket.id);
      await loadEvents(selectedTicket.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not escalate ticket');
    } finally {
      setEscalating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="landing-nav">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <SanyLogo size={32} full />
        </Link>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, textAlign: 'center' }}>Customer Care</div>
        <Link to="/" className="btn btn-secondary btn-sm">
          <i data-lucide="arrow-left" style={{ width: 13, height: 13 }} /> Back to events
        </Link>
      </nav>

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px 20px 40px' }}>
        {error && (
          <div style={{
            marginBottom: 14,
            background: 'var(--danger-dim)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12,
            padding: '10px 12px',
            color: 'var(--danger)',
          }}>
            {error}
          </div>
        )}
        {done && (
          <div style={{
            marginBottom: 14,
            background: 'var(--accent-dim)',
            border: '1px solid rgba(201,162,39,0.25)',
            borderRadius: 12,
            padding: '10px 12px',
            color: 'var(--accent)',
          }}>
            Ticket created: <strong>{done.request_id}</strong>
          </div>
        )}

        <SupportInbox
          title="Help Center"
          subtitle={`Chat-style support. Replies land in ${supportEmail}.`}
          tickets={tickets}
          loadingTickets={loadingTickets}
          selectedTicket={selectedTicket}
          onSelectTicket={(ticket) => setSelectedId(ticket.id)}
          messages={messages}
          loadingMessages={loadingMessages}
          onRefresh={() => {
            loadTickets();
            loadMessages(selectedId);
            loadEvents(selectedId);
          }}
          onSendMessage={sendReply}
          sendingMessage={sendingMessage}
          draftPlaceholder="Reply to support with extra details, screenshots summary, or follow-up questions…"
          composerActions={selectedTicket ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => quickReply('I have attached the correct payment details and order reference above.')}>
                Payment details
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => quickReply('Please update me on the status of this issue when there is progress.')}>
                Ask for update
              </button>
            </>
          ) : null}
          emptyTitle="No ticket selected"
          emptySubtitle="Start a new request or open one of your existing conversations."
          roleLabels={{ admin: 'Support team', organizer: 'Organizer', user: 'You', guest: 'Customer' }}
          ticketMeta={(ticket) => (
            ticket.owner_lane ? (
              <Badge variant={ticket.owner_lane === 'organizer' ? 'yellow' : 'red'}>
                {ticket.owner_lane === 'organizer' ? 'Organizer' : 'Super Admin'}
              </Badge>
            ) : null
          )}
          threadMeta={(ticket) => (
            <>
              {ticket.sla_state && <Badge variant={ticket.sla_state === 'overdue' ? 'red' : ticket.sla_state === 'due_soon' ? 'yellow' : 'blue'}>{ticket.sla_state}</Badge>}
              {ticket.owner_lane && (
                <Badge variant={ticket.owner_lane === 'organizer' ? 'yellow' : 'red'}>
                  {ticket.owner_lane === 'organizer' ? 'Organizer lane' : 'Admin lane'}
                </Badge>
              )}
            </>
          )}
          threadActions={selectedTicket && !['resolved', 'closed'].includes(selectedTicket.status) ? (
            <button className="btn btn-danger btn-sm" onClick={escalate} disabled={escalating}>
              {escalating
                ? <><i data-lucide="loader-2" style={{ width: 13, height: 13 }} /> Escalating…</>
                : <><i data-lucide="shield-alert" style={{ width: 13, height: 13 }} /> Escalate</>}
            </button>
          ) : null}
          introPanel={(
            <div className="support-thread-empty">
              <EmptyState
                icon="messages-square"
                title="Your support inbox"
                sub="Create a request on the left, then keep the full conversation here like a chat thread."
              />
            </div>
          )}
          sidebarFooter={(
            <>
              <div className="support-info-card">
                <div className="support-info-title">New support request</div>
                <form onSubmit={submitTicket} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input className="input" value={form.name} onChange={onChange('name')} placeholder="Your name" required />
                  <input className="input" type="email" value={form.email} onChange={onChange('email')} placeholder="Email" required />
                  <select className="select" value={form.category} onChange={onChange('category')}>
                    <option value="tickets">Tickets</option>
                    <option value="payments">Payments</option>
                    <option value="refunds">Refunds</option>
                    <option value="account">Account</option>
                    <option value="organizer">Organizer</option>
                    <option value="technical">Technical</option>
                    <option value="other">Other</option>
                  </select>
                  <input className="input" value={form.order_ref} onChange={onChange('order_ref')} placeholder="Order reference" />
                  <input className="input" value={form.subject} onChange={onChange('subject')} placeholder="Subject" required />
                  <textarea className="textarea" value={form.message} onChange={onChange('message')} placeholder="Describe the issue" style={{ minHeight: 92 }} required />
                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting
                      ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Sending…</>
                      : <><i data-lucide="plus" style={{ width: 14, height: 14 }} /> Open ticket</>}
                  </button>
                </form>
              </div>

              <div className="support-info-card">
                <div className="support-info-title">Quick answers</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FAQS.map((faq) => (
                    <details key={faq.q} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', background: 'var(--surface2)' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>{faq.q}</summary>
                      <div style={{ marginTop: 8, color: 'var(--text2)', fontSize: 12 }}>{faq.a}</div>
                    </details>
                  ))}
                </div>
              </div>
            </>
          )}
          threadSidebar={selectedTicket && (
            <>
              <div className="support-kpi-grid">
                <div className="support-kpi">
                  <div className="support-kpi-label">Replies</div>
                  <div className="support-kpi-value">{selectedTicket.message_count || messages.length}</div>
                </div>
                <div className="support-kpi">
                  <div className="support-kpi-label">Owner</div>
                  <div className="support-kpi-value" style={{ fontSize: 14 }}>
                    {selectedTicket.owner_lane === 'organizer' ? 'Organizer' : 'Support'}
                  </div>
                </div>
              </div>
              <div className="support-info-card">
                <div className="support-info-title">Ticket details</div>
                <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.8 }}>
                  Category: <strong style={{ color: 'var(--text)' }}>{selectedTicket.category}</strong><br />
                  Status group: <strong style={{ color: 'var(--text)' }}>{selectedTicket.status_group || selectedTicket.status}</strong><br />
                  Last update: <strong style={{ color: 'var(--text)' }}>{selectedTicket.updated_at ? new Date(selectedTicket.updated_at).toLocaleString('en-KE') : 'Now'}</strong>
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
      </div>
    </div>
  );
}
