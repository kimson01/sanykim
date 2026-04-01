import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, EmptyState } from './index';

const statusVariant = (status) => (
  status === 'resolved' ? 'green'
    : status === 'closed' ? 'gray'
      : status === 'escalated' ? 'red'
        : status === 'waiting_organizer' ? 'yellow'
          : status === 'in_review' ? 'blue'
            : 'orange'
);

const priorityVariant = (priority) => (
  priority === 'urgent' ? 'red'
    : priority === 'high' ? 'yellow'
      : priority === 'low' ? 'gray'
        : 'blue'
);

const initialFor = (value = '') => value.trim().charAt(0).toUpperCase() || '?';

function fmtTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(value) {
  if (!value) return 'Now';
  return new Date(value).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDayLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function attentionLevel(ticket) {
  if (!ticket) return '';
  if (
    ticket.sla_state === 'overdue' ||
    ticket.priority === 'urgent' ||
    ticket.status === 'escalated' ||
    Number(ticket.escalation_level || 0) > 0
  ) return 'urgent';
  if (
    ticket.sla_state === 'due_soon' ||
    ticket.priority === 'high' ||
    ticket.status === 'waiting_organizer'
  ) return 'active';
  return '';
}

function conversationLabel(ticket) {
  if (ticket.event_title) return ticket.event_title;
  if (ticket.organizer_name) return ticket.organizer_name;
  if (ticket.user_email) return ticket.user_email;
  if (ticket.order_ref) return ticket.order_ref;
  return ticket.ticket_ref || 'Support conversation';
}

function previewLabel(ticket) {
  if (ticket.status === 'escalated') return 'Escalated';
  if (ticket.status === 'waiting_organizer') return 'Waiting organizer';
  if (ticket.sla_state === 'overdue') return 'Overdue';
  if (ticket.sla_state === 'due_soon') return 'Due soon';
  if (ticket.owner_lane === 'super_admin') return 'Admin lane';
  if (ticket.owner_lane === 'organizer') return 'Organizer lane';
  return '';
}

function AuthorMeta({ message, roleLabels }) {
  const label = roleLabels?.[message.author_role] || message.author_role || 'system';
  return (
    <div className="support-bubble-meta">
      <span>{message.author_name || label}</span>
      <span>{fmtDateTime(message.created_at)}</span>
    </div>
  );
}

export default function SupportInbox({
  title,
  subtitle,
  tickets,
  loadingTickets,
  selectedTicket,
  onSelectTicket,
  messages,
  loadingMessages,
  onRefresh,
  onSendMessage,
  sendingMessage,
  draftPlaceholder = 'Type a reply…',
  emptyTitle,
  emptySubtitle,
  toolbar,
  threadActions,
  composerActions,
  composerMeta,
  introPanel,
  filters,
  sidebarFooter,
  threadSidebar,
  ticketMeta,
  threadMeta,
  roleLabels,
}) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 900 : false));
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const threadBodyRef = useRef(null);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tickets;
    return tickets.filter((ticket) => (
      ticket.subject?.toLowerCase().includes(term) ||
      ticket.ticket_ref?.toLowerCase().includes(term) ||
      ticket.user_email?.toLowerCase().includes(term) ||
      ticket.organizer_name?.toLowerCase().includes(term) ||
      ticket.order_ref?.toLowerCase().includes(term)
    ));
  }, [tickets, search]);

  useEffect(() => {
    const node = threadBodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, selectedTicket?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 900px)');
    const update = (event) => {
      const nextMobile = event.matches;
      setIsMobile(nextMobile);
      if (!nextMobile) {
        setMobileThreadOpen(false);
        setMobileDetailsOpen(false);
      }
    };
    update(media);
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (!isMobile || !selectedTicket?.id) return;
    setMobileThreadOpen(true);
    setMobileDetailsOpen(false);
  }, [isMobile, selectedTicket?.id]);

  const submit = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedTicket || !onSendMessage) return;
    const ok = await onSendMessage({ body });
    if (ok !== false) setDraft('');
  };

  const onComposerKeyDown = async (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedTicket || !onSendMessage) return;
    const ok = await onSendMessage({ body });
    if (ok !== false) setDraft('');
  };

  return (
    <div className={`support-shell ${isMobile && mobileThreadOpen ? 'mobile-thread-open' : 'mobile-list-open'} ${mobileDetailsOpen ? 'mobile-details-open' : ''}`}>
      <div className="support-sidebar">
        <div className="support-sidebar-header">
          <div>
            <div className="support-title">{title}</div>
            {subtitle && <div className="support-subtitle">{subtitle}</div>}
          </div>
          {toolbar}
        </div>

        <div className="support-search">
          <i data-lucide="search" style={{ width: 14, height: 14 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets"
          />
        </div>

        {filters && <div className="support-filter-row">{filters}</div>}

        <div className="support-list">
          {loadingTickets ? (
            <div className="support-pane-empty">Loading conversations…</div>
          ) : filteredTickets.length === 0 ? (
            <div className="support-pane-empty">{emptySubtitle || 'No conversations yet.'}</div>
          ) : filteredTickets.map((ticket) => {
            const active = selectedTicket?.id === ticket.id;
            const level = attentionLevel(ticket);
            const label = previewLabel(ticket);
            const unreadCount = Number(ticket.unread_count || 0);
            return (
              <button
                key={ticket.id}
                className={`support-chat-row ${active ? 'active' : ''} ${level ? `attention-${level}` : ''} ${unreadCount > 0 && !active ? 'has-unread' : ''}`}
                onClick={() => {
                  onSelectTicket(ticket);
                  if (isMobile) {
                    setMobileThreadOpen(true);
                    setMobileDetailsOpen(false);
                  }
                }}
              >
                <div className="support-chat-avatar">
                  {initialFor(ticket.user_name || ticket.organizer_name || ticket.subject)}
                </div>
                <div className="support-chat-main">
                  <div className="support-chat-topline">
                    <div className="support-chat-name-wrap">
                      {level && <span className={`support-attention-dot ${level}`} />}
                      <div className="support-chat-name">{ticket.subject}</div>
                    </div>
                    <div className="support-chat-time">{fmtTime(ticket.last_message_at_effective || ticket.updated_at)}</div>
                  </div>
                  <div className="support-chat-context">{conversationLabel(ticket)}</div>
                  <div className={`support-chat-preview ${unreadCount > 0 && !active ? 'unread' : ''}`}>
                    {label && <span className={`support-preview-label ${level || 'neutral'}`}>{label}</span>}
                    {ticket.last_message_preview || ticket.message || 'No message preview'}
                  </div>
                  <div className="support-chat-tags">
                    <Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge>
                    <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
                    {unreadCount > 0 && (
                      <span className="support-count-pill">{unreadCount}</span>
                    )}
                    {ticketMeta?.(ticket)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {sidebarFooter && (
          <div className="support-info-panel">
            {sidebarFooter}
          </div>
        )}
      </div>

      <div className="support-thread">
        {selectedTicket ? (
          <>
            <div className="support-thread-header">
              <div className="support-thread-identity">
                {isMobile && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm support-mobile-back"
                    onClick={() => {
                      setMobileThreadOpen(false);
                      setMobileDetailsOpen(false);
                    }}
                  >
                    <i data-lucide="arrow-left" style={{ width: 13, height: 13 }} /> Chats
                  </button>
                )}
                <div className="support-chat-avatar large">
                  {initialFor(selectedTicket.user_name || selectedTicket.organizer_name || selectedTicket.subject)}
                </div>
                <div>
                  <div className="support-thread-title">{selectedTicket.subject}</div>
                  <div className="support-thread-subtitle">
                    {selectedTicket.ticket_ref}
                    {selectedTicket.order_ref ? ` · ${selectedTicket.order_ref}` : ''}
                    {selectedTicket.event_title ? ` · ${selectedTicket.event_title}` : ''}
                  </div>
                </div>
              </div>
              <div className="support-thread-badges">
                <Badge variant={statusVariant(selectedTicket.status)}>{selectedTicket.status}</Badge>
                <Badge variant={priorityVariant(selectedTicket.priority)}>{selectedTicket.priority}</Badge>
                {threadMeta?.(selectedTicket)}
                {isMobile && threadSidebar && (
                  <button
                    type="button"
                    className={`btn btn-secondary btn-sm ${mobileDetailsOpen ? 'support-mobile-details-active' : ''}`}
                    onClick={() => setMobileDetailsOpen((value) => !value)}
                  >
                    <i data-lucide="panel-right-open" style={{ width: 13, height: 13 }} /> Details
                  </button>
                )}
                {threadActions}
              </div>
            </div>

            <div className="support-thread-main">
              <div className="support-thread-column">
                <div className="support-thread-body" ref={threadBodyRef}>
                  {loadingMessages ? (
                    <div className="support-pane-empty">Loading thread…</div>
                  ) : messages.length === 0 ? (
                    <div className="support-pane-empty">No replies yet.</div>
                  ) : messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const showDay = !previous || fmtDayLabel(previous.created_at) !== fmtDayLabel(message.created_at);
                    const mine = ['user', 'organizer', 'admin'].includes(message.author_role) &&
                      selectedTicket &&
                      ((selectedTicket.viewer_role === 'admin' && message.author_role === 'admin') ||
                       (selectedTicket.viewer_role === 'organizer' && message.author_role === 'organizer') ||
                       (selectedTicket.viewer_role === 'user' && message.author_role === 'user'));
                    return (
                      <React.Fragment key={message.id}>
                        {showDay && (
                          <div className="support-day-separator">
                            <span>{fmtDayLabel(message.created_at)}</span>
                          </div>
                        )}
                        <div className={`support-bubble-row ${mine ? 'mine' : ''}`}>
                          <div className={`support-bubble ${mine ? 'mine' : ''} ${message.is_internal ? 'internal' : ''}`}>
                            <AuthorMeta message={message} roleLabels={roleLabels} />
                            {message.is_internal && <div className="support-bubble-flag">Internal note</div>}
                            <div>{message.body}</div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                <form className="support-composer" onSubmit={submit}>
                  <textarea
                    className="textarea"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder={draftPlaceholder}
                    style={{ minHeight: 56, maxHeight: 120 }}
                  />
                  <div className="support-composer-actions">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {composerActions}
                      {composerMeta}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {onRefresh && (
                        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
                          <i data-lucide="refresh-cw" style={{ width: 14, height: 14 }} /> Refresh
                        </button>
                      )}
                      {onSendMessage && (
                        <button className="btn btn-primary" type="submit" disabled={sendingMessage || !draft.trim()}>
                          {sendingMessage
                            ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Sending…</>
                            : <><i data-lucide="send-horizontal" style={{ width: 14, height: 14 }} /> Send</>}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              {threadSidebar && (
                <div className="support-thread-sidepanel">
                  {threadSidebar}
                </div>
              )}
            </div>
          </>
        ) : introPanel || (
          <div className="support-thread-empty">
            <EmptyState
              icon="messages-square"
              title={emptyTitle || 'Select a ticket'}
              sub={emptySubtitle || 'Pick a conversation from the left to view the thread.'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
