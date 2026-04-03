// src/pages/user/UserTickets.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI } from '../../api/client';
import { fmtDate, useToast } from '../../components/ui';
import { QRCodeSVG } from 'qrcode.react';
import SanyLogo from '../../components/ui/Logo';
import { useTicketPdfDownload } from '../../utils/useTicketPdfDownload';

function useTicketCodeCopy() {
  const { toast } = useToast();

  const copy = async (code) => {
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      toast('Ticket code copied', 'success');
    } catch (_) {
      toast('Could not copy ticket code', 'error');
    }
  };

  return { copy };
}

// ── Single ticket card ────────────────────────────────────────
function TicketCard({ ticket, onDownload, onCopyCode, downloading }) {
  const voided = ticket.is_voided;
  const used = !voided && ticket.is_scanned;
  const statusLabel = voided ? 'Refunded' : used ? 'Used' : 'Valid';
  const statusColor = voided ? 'var(--danger)' : used ? 'var(--text3)' : 'var(--accent)';
  const statusBg = voided ? 'var(--danger-dim)' : used ? 'var(--surface3)' : 'var(--accent-dim)';

  return (
    <div className="ticket-card">
      <div className="ticket-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
              {ticket.event_title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{ticket.location}</div>
          </div>
          <span style={{
            background: statusBg, color: statusColor,
            padding: '3px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8,
          }}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="ticket-dashed" />

      <div className="ticket-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div className="form-label">Date</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(ticket.event_date)}</div>
          </div>
          <div>
            <div className="form-label">Time</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{ticket.start_time}</div>
          </div>
          <div>
            <div className="form-label">Seat</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{ticket.seat_number}</div>
          </div>
          <div>
            <div className="form-label">Type</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: voided ? 'var(--danger)' : (ticket.color || 'var(--accent2)') }}>
              {ticket.ticket_type_name}
            </div>
          </div>
          <div>
            <div className="form-label">Order</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{ticket.order_ref}</div>
          </div>
          <div>
            <div className="form-label">Price</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {Number(ticket.price) > 0 ? `KSh ${Number(ticket.price).toLocaleString()}` : 'Free'}
            </div>
          </div>
        </div>
      </div>

      <div className="ticket-dashed" />

      <div className="ticket-qr">
        {voided ? (
          <div style={{
            minWidth: 130,
            minHeight: 130,
            borderRadius: 12,
            border: '1px dashed rgba(239,68,68,0.35)',
            background: 'var(--danger-dim)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
            fontSize: 12,
            fontWeight: 600,
          }}>
            Refunded ticket
            <br />
            Not valid for entry
          </div>
        ) : (
          <div className="qr-container">
            <QRCodeSVG
              value={ticket.qr_data || ticket.ticket_code}
              size={110}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
        )}
      </div>

      <div className="ticket-footer">
        <div
          onClick={() => !voided && onCopyCode(ticket.ticket_code)}
          title={voided ? 'Refunded ticket code cannot be used' : 'Copy ticket code'}
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: voided ? 'var(--text3)' : 'var(--text2)',
            cursor: voided ? 'default' : 'pointer',
            userSelect: voided ? 'none' : 'all',
          }}
        >
          {ticket.ticket_code}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onCopyCode(ticket.ticket_code)}
            title={voided ? 'Refunded ticket code cannot be used' : 'Copy ticket code'}
            disabled={voided}
            style={{ padding: '3px 8px' }}
          >
            <i data-lucide="copy" style={{ width: 12, height: 12 }} /> Copy
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onDownload(ticket.order_id, ticket.order_ref)}
            disabled={voided || downloading === ticket.order_id}
            title={voided ? 'Refunded tickets cannot be downloaded as valid tickets' : 'Download PDF'}
            style={{ padding: '3px 8px' }}
          >
            {downloading === ticket.order_id
              ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} />
              : <><i data-lucide="download" style={{ width: 12, height: 12 }} /> PDF</>
            }
          </button>
          <SanyLogo size={20} />
        </div>
      </div>
    </div>
  );
}

export default function UserTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { download, downloading } = useTicketPdfDownload();
  const { copy } = useTicketCodeCopy();
  const { toast } = useToast();

  useEffect(() => {
    ordersAPI.myTickets()
      .then(r => setTickets(r.data.data))
      .catch((err) => {
        setTickets([]);
        toast(err.response?.data?.message || 'Failed to load tickets', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  if (!tickets.length) return (
    <div className="empty-state">
      <div className="empty-icon"><i data-lucide="ticket" style={{ width: 40, height: 40 }} /></div>
      <div className="empty-title">No tickets yet</div>
      <div className="empty-sub">Browse events and purchase tickets to see them here</div>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>
        <i data-lucide="search" style={{ width: 14, height: 14 }} /> Browse events
      </Link>
    </div>
  );

  return (
    <div className="events-grid">
      {tickets.map(t => (
        <TicketCard
          key={t.id}
          ticket={t}
          onDownload={download}
          onCopyCode={copy}
          downloading={downloading}
        />
      ))}
    </div>
  );
}
