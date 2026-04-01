// utils/pdfTicket.js — Generate a PDF for one or more tickets
const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');

/**
 * streamTicketPDF
 * Pipes a PDF containing all tickets for an order to the HTTP response.
 *
 * @param {object} res     - Express response (we pipe directly to it)
 * @param {object} order   - { order_ref, attendee_name, attendee_email }
 * @param {object} event   - { title, event_date, start_time, location }
 * @param {Array}  tickets - [{ ticket_code, ticket_type_name, seat_number, qr_data }]
 */
async function streamTicketPDF(res, order, event, tickets) {
  // Generate all QR images first (async) so the PDF stream stays synchronous
  const qrImages = await Promise.all(
    tickets.map(t =>
      QRCode.toBuffer(t.qr_data || t.ticket_code, { width: 160, margin: 1 })
    )
  );

  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'Sany Adventures Ticket' } });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="sany-tickets-${order.order_ref}.pdf"`
  );
  doc.pipe(res);

  // ── Brand colours ──────────────────────────────────────────
  const GREEN  = '#22c55e';
  const DARK   = '#0a0a0a';
  const LIGHT  = '#f0f0f0';
  const MUTED  = '#a0a0a0';
  const BORDER = '#2a2a2a';

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  tickets.forEach((ticket, idx) => {
    if (idx > 0) doc.addPage();

    const W = doc.page.width - 80;  // usable width
    const x = 40;
    let y   = 40;

    // ── Header bar ─────────────────────────────────────────
    doc.rect(x, y, W, 50).fill(DARK);
    // Logo S mark
    doc.roundedRect(x + 12, y + 10, 30, 30, 6).fill(GREEN);
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text('S', x + 12, y + 13, { width: 30, align: 'center' });
    // Brand name
    doc.fillColor(LIGHT).font('Helvetica-Bold').fontSize(16).text('Sany Adventures', x + 52, y + 10);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('TICKETING PLATFORM', x + 52, y + 30);
    // Ticket badge top-right
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10)
      .text('TICKET', x + W - 70, y + 10, { width: 60, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(ticket.ticket_type_name || 'GENERAL', x + W - 70, y + 24, { width: 60, align: 'right' });

    y += 62;

    // ── Event title ────────────────────────────────────────
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(20)
      .text(event.title, x, y, { width: W });
    y += doc.currentLineHeight() + 6;

    // ── Event details grid (2 columns) ────────────────────
    const col2 = x + W / 2;
    const detailRows = [
      { label: 'Date',     value: fmtDate(event.event_date) },
      { label: 'Time',     value: event.start_time || '' },
      { label: 'Venue',    value: event.location || '' },
      { label: 'Type',     value: ticket.ticket_type_name || '' },
    ];
    detailRows.forEach((row, i) => {
      const cx = i % 2 === 0 ? x : col2;
      if (i % 2 === 0 && i > 0) y += 36;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(row.label.toUpperCase(), cx, y);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text(row.value, cx, y + 10, { width: W / 2 - 10 });
    });
    y += 50;

    // ── Divider ────────────────────────────────────────────
    doc.moveTo(x, y).lineTo(x + W, y).dash(4, { space: 4 }).strokeColor(BORDER).stroke();
    doc.undash();
    y += 16;

    // ── QR code + ticket info ──────────────────────────────
    const qrSize = 120;
    doc.image(qrImages[idx], x, y, { width: qrSize, height: qrSize });

    const infoX = x + qrSize + 20;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('TICKET CODE', infoX, y);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text(ticket.ticket_code || '', infoX, y + 10, { width: W - qrSize - 20 });

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('SEAT', infoX, y + 32);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text(ticket.seat_number || 'General Admission', infoX, y + 42);

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('ATTENDEE', infoX, y + 64);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text(order.attendee_name || '', infoX, y + 74, { width: W - qrSize - 20 });

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('ORDER', infoX, y + 96);
    doc.fillColor(DARK).font('Helvetica').fontSize(9)
      .text(order.order_ref || '', infoX, y + 106);

    y += qrSize + 16;

    // ── Second divider ─────────────────────────────────────
    doc.moveTo(x, y).lineTo(x + W, y).dash(4, { space: 4 }).strokeColor(BORDER).stroke();
    doc.undash();
    y += 12;

    // ── Footer ─────────────────────────────────────────────
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'Present this QR code at the entrance for scanning. Each ticket is single-use. Sany Adventures.',
        x, y, { width: W, align: 'center' }
      );

    // ── Page number ────────────────────────────────────────
    if (tickets.length > 1) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(`${idx + 1} / ${tickets.length}`, x, doc.page.height - 30, { width: W, align: 'right' });
    }
  });

  doc.end();
}

module.exports = { streamTicketPDF };
