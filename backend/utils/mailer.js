// utils/mailer.js
// Nodemailer wrapper — gracefully no-ops when SMTP is not configured.
// Phase 2: email ticket on purchase + event reminder 24h before.

const nodemailer = require('nodemailer');

// ── Build transporter ─────────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    // No SMTP config — mailer will log but not throw
    return null;
  }

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendMail(options) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — skipping email to ${options.to}`);
    return false;
  }
  try {
    const from = process.env.SMTP_FROM || `"Sany Adventures" <${process.env.SMTP_USER}>`;
    await t.sendMail({ from, ...options });
    console.log(`[mailer] Email sent to ${options.to}: ${options.subject}`);
    return true;
  } catch (err) {
    console.error('[mailer] Send failed:', err.message);
    return false;
  }
}

// ── Brand colours (inline CSS — email clients don't load stylesheets) ──
const BRAND_GREEN  = '#22c55e';
const BRAND_DARK   = '#0a0a0a';
const BRAND_LIGHT  = '#f0f0f0';
const BRAND_MUTED  = '#a0a0a0';
const BRAND_SURFACE = '#111111';
const BRAND_BORDER = '#2a2a2a';

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sany Adventures</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_DARK};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${BRAND_LIGHT}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_DARK};padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="padding:0 0 24px 0">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:${BRAND_GREEN};width:36px;height:36px;border-radius:9px;text-align:center;vertical-align:middle">
                  <span style="font-size:18px;font-weight:900;color:#000;font-family:Georgia,serif">S</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle">
                  <span style="font-size:18px;font-weight:800;color:${BRAND_LIGHT};letter-spacing:-0.02em">Sany</span>
                  <span style="font-size:10px;color:${BRAND_MUTED};display:block;letter-spacing:0.12em;text-transform:uppercase">Events</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body card -->
        <tr>
          <td style="background:${BRAND_SURFACE};border:1px solid ${BRAND_BORDER};border-radius:14px;padding:32px">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 0 0 0;text-align:center;font-size:11px;color:${BRAND_MUTED}">
            Sany Adventures &bull; East Africa's Adventure Platform<br>
            <a href="#" style="color:${BRAND_MUTED}">Unsubscribe</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── sendTicketEmail ───────────────────────────────────────────
/**
 * Sends a booking confirmation email with all ticket codes.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.attendeeName
 * @param {string} opts.orderRef
 * @param {object} opts.event       - { title, event_date, start_time, location }
 * @param {Array}  opts.tickets     - [{ code, type, seat, qr }]
 */
async function sendTicketEmail({ to, attendeeName, orderRef, event, tickets }) {
  const ticketRows = tickets.map(t => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${BRAND_BORDER}">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="font-size:13px;font-weight:700;color:${BRAND_GREEN}">${t.type}</div>
              <div style="font-size:12px;color:${BRAND_MUTED};margin-top:2px">Seat: ${t.seat}</div>
              <div style="font-family:monospace;font-size:11px;color:${BRAND_MUTED};margin-top:4px;letter-spacing:0.05em">${t.code}</div>
            </td>
            ${t.qr ? `<td style="text-align:right">
              <img src="${t.qr}" width="80" height="80" alt="QR code" style="border-radius:6px" />
            </td>` : ''}
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">Your tickets are confirmed</h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">Hi ${attendeeName}, your booking for <strong style="color:${BRAND_LIGHT}">${event.title}</strong> is confirmed.</p>

    <!-- Event details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <div style="font-size:16px;font-weight:700;color:${BRAND_LIGHT};margin-bottom:10px">${event.title}</div>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:6px;padding-bottom:6px">
                <span style="font-size:12px;color:${BRAND_MUTED}">Date</span>
                <div style="font-size:13px;color:${BRAND_LIGHT}">${new Date(event.event_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:6px">
                <span style="font-size:12px;color:${BRAND_MUTED}">Time</span>
                <div style="font-size:13px;color:${BRAND_LIGHT}">${event.start_time}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span style="font-size:12px;color:${BRAND_MUTED}">Location</span>
                <div style="font-size:13px;color:${BRAND_LIGHT}">${event.location}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Order ref -->
    <p style="font-size:12px;color:${BRAND_MUTED};margin:0 0 16px 0">Order reference: <strong style="color:${BRAND_LIGHT};font-family:monospace">${orderRef}</strong></p>

    <!-- Tickets -->
    <div style="font-size:13px;font-weight:600;color:${BRAND_LIGHT};margin-bottom:8px;text-transform:uppercase;letter-spacing:0.08em">Your tickets</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${ticketRows}
    </table>

    <p style="margin:24px 0 0 0;font-size:12px;color:${BRAND_MUTED}">
      Present the QR code at the venue entrance for scanning. Each code is single-use.
    </p>
  `;

  return sendMail({
    to,
    subject: `Your tickets for ${event.title} — Sany Adventures`,
    html:    emailWrapper(content),
  });
}

// ── sendReminderEmail ─────────────────────────────────────────
/**
 * Sends a 24-hour reminder email to an attendee.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.attendeeName
 * @param {object} opts.event       - { title, event_date, start_time, location, location_type, virtual_url }
 * @param {number} opts.ticketCount
 */
async function sendReminderEmail({ to, attendeeName, event, ticketCount }) {
  const locationLine = event.location_type === 'virtual'
    ? `<a href="${event.virtual_url}" style="color:${BRAND_GREEN}">${event.virtual_url}</a>`
    : event.location;

  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">Your event is tomorrow</h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">Hi ${attendeeName}, just a reminder that <strong style="color:${BRAND_LIGHT}">${event.title}</strong> is happening tomorrow.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <div style="font-size:16px;font-weight:700;color:${BRAND_LIGHT};margin-bottom:10px">${event.title}</div>
          <div style="font-size:12px;color:${BRAND_MUTED}">Date &amp; Time</div>
          <div style="font-size:13px;color:${BRAND_LIGHT};margin-bottom:8px">${new Date(event.event_date).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })} at ${event.start_time}</div>
          <div style="font-size:12px;color:${BRAND_MUTED}">${event.location_type === 'virtual' ? 'Join link' : 'Venue'}</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${locationLine}</div>
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:${BRAND_MUTED};margin:0">
      You have <strong style="color:${BRAND_LIGHT}">${ticketCount} ticket${ticketCount !== 1 ? 's' : ''}</strong> for this event.
      Open the Sany Adventures app or website to access your QR codes.
    </p>
  `;

  return sendMail({
    to,
    subject: `Reminder: ${event.title} is tomorrow — Sany Adventures`,
    html:    emailWrapper(content),
  });
}

// ── sendResetEmail ────────────────────────────────────────────
async function sendResetEmail({ to, name, resetUrl }) {
  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">Reset your password</h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">Hi ${name}, click the button below to choose a new password. This link expires in 1 hour.</p>
    <a href="${resetUrl}" style="display:inline-block;background:${BRAND_GREEN};color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
      Reset password
    </a>
    <p style="margin:24px 0 0 0;font-size:12px;color:${BRAND_MUTED}">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;

  return sendMail({
    to,
    subject: 'Reset your Sany Adventures password',
    html:    emailWrapper(content),
  });
}


// ── sendRefundEmail ───────────────────────────────────────────
/**
 * Notifies the attendee that their order has been refunded.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.attendeeName
 * @param {string} opts.orderRef
 * @param {number} opts.amount        - full order total
 * @param {string} opts.reason
 */
async function sendRefundEmail({ to, attendeeName, orderRef, amount, reason }) {
  const fmtKes = (n) => 'KES ' + Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2 });

  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">Your refund has been processed</h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">
      Hi ${attendeeName}, your order has been refunded. Here are the details.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:10px">
                <span style="font-size:12px;color:${BRAND_MUTED}">ORDER REFERENCE</span>
                <div style="font-family:monospace;font-size:14px;font-weight:700;color:${BRAND_LIGHT};margin-top:2px">
                  ${orderRef}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:10px">
                <span style="font-size:12px;color:${BRAND_MUTED}">REFUND AMOUNT</span>
                <div style="font-size:20px;font-weight:800;color:#ef4444;margin-top:2px">
                  ${fmtKes(amount)}
                </div>
              </td>
            </tr>
            ${reason ? `
            <tr>
              <td>
                <span style="font-size:12px;color:${BRAND_MUTED}">REASON</span>
                <div style="font-size:13px;color:${BRAND_LIGHT};margin-top:2px">${reason}</div>
              </td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:${BRAND_MUTED};margin:0 0 12px 0">
      All tickets associated with this order have been invalidated and can no longer be used for entry.
    </p>
    <p style="font-size:13px;color:${BRAND_MUTED};margin:0">
      The refunded amount will be returned to your M-PESA account within <strong style="color:${BRAND_LIGHT}">3–5 business days</strong>
      depending on your mobile network. If you have not received your refund after 5 days,
      please contact <a href="mailto:support@sanyadventures.com" style="color:${BRAND_GREEN}">support@sanyadventures.com</a>
      with your order reference.
    </p>
  `;

  return sendMail({
    to,
    subject: `Refund processed for order ${orderRef} — Sany Adventures`,
    html:    emailWrapper(content),
  });
}


// ── sendVerificationEmail ─────────────────────────────────────
/**
 * Sends an email address verification link after registration.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.verifyUrl   - Full URL with token
 */
async function sendVerificationEmail({ to, name, verifyUrl }) {
  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">
      Verify your email address
    </h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">
      Hi ${name}, welcome to Sany Adventures. Click the button below to verify your
      email address and activate your account. This link expires in <strong style="color:${BRAND_LIGHT}">24 hours</strong>.
    </p>
    <a href="${verifyUrl}"
       style="display:inline-block;background:${BRAND_GREEN};color:#0d0b06;font-weight:700;
              font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none;
              letter-spacing:0.01em">
      Verify email address
    </a>
    <p style="margin:24px 0 0 0;font-size:12px;color:${BRAND_MUTED}">
      If you didn't create a Sany Adventures account you can safely ignore this email.
    </p>
    <p style="margin:12px 0 0 0;font-size:11px;color:${BRAND_MUTED};word-break:break-all">
      Or copy this link: <a href="${verifyUrl}" style="color:${BRAND_GREEN}">${verifyUrl}</a>
    </p>
  `;
  return sendMail({
    to,
    subject: 'Verify your Sany Adventures email address',
    html:    emailWrapper(content),
  });
}


// ── sendWaitlistNotification ──────────────────────────────────
/**
 * Tells someone on the waitlist that a ticket is now available.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {object} opts.event      - { id, title, event_date, start_time, location }
 * @param {string} opts.checkoutUrl
 * @param {number} opts.hoursToAct - how many hours they have to claim the ticket
 */
async function sendWaitlistEmail({ to, name, event, checkoutUrl, hoursToAct = 24 }) {
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">
      A ticket just became available!
    </h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">
      Hi ${name}, good news — a spot just opened up for an event you were waiting for.
      You have <strong style="color:${BRAND_LIGHT}">${hoursToAct} hours</strong> to claim it before it goes to the next person.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.2);border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <div style="font-size:17px;font-weight:700;color:${BRAND_LIGHT};margin-bottom:8px">${event.title}</div>
          <div style="font-size:12px;color:${BRAND_MUTED}">Date &amp; Time</div>
          <div style="font-size:13px;color:${BRAND_LIGHT};margin-bottom:6px">${fmtD(event.event_date)} at ${event.start_time || ''}</div>
          <div style="font-size:12px;color:${BRAND_MUTED}">Venue</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${event.location || ''}</div>
        </td>
      </tr>
    </table>

    <a href="${checkoutUrl}"
       style="display:inline-block;background:${BRAND_GREEN};color:#0d0b06;font-weight:700;
              font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none">
      Claim your ticket now
    </a>
    <p style="margin:20px 0 0 0;font-size:12px;color:${BRAND_MUTED}">
      This offer expires in ${hoursToAct} hours. If you no longer need a ticket, simply ignore this email.
    </p>
  `;

  return sendMail({
    to,
    subject: `A spot opened up — ${event.title} · Sany Adventures`,
    html:    emailWrapper(content),
  });
}

// ── sendAbandonmentEmail ──────────────────────────────────────
/**
 * Sent ~30 minutes after a checkout is started but not completed.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.orderRef
 * @param {object} opts.event       - { title, event_date, start_time, location }
 * @param {number} opts.total       - KES amount
 * @param {string} opts.checkoutUrl - direct link back to checkout
 */
async function sendAbandonmentEmail({ to, name, orderRef, event, total, checkoutUrl }) {
  const fmtKes = (n) => 'KES ' + Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 });
  const fmtD   = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const content = `
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">
      You left tickets behind
    </h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:${BRAND_MUTED}">
      Hi ${name}, you started buying tickets for <strong style="color:${BRAND_LIGHT}">${event.title}</strong>
      but didn't complete your purchase. Spots are limited — complete your booking before they sell out.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.2);border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <div style="font-size:17px;font-weight:700;color:${BRAND_LIGHT};margin-bottom:8px">${event.title}</div>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:32px;padding-bottom:6px">
                <div style="font-size:11px;color:${BRAND_MUTED}">DATE</div>
                <div style="font-size:13px;color:${BRAND_LIGHT}">${fmtD(event.event_date)}</div>
              </td>
              <td style="padding-bottom:6px">
                <div style="font-size:11px;color:${BRAND_MUTED}">ORDER TOTAL</div>
                <div style="font-size:14px;font-weight:700;color:${BRAND_GREEN}">${fmtKes(total)}</div>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <div style="font-size:11px;color:${BRAND_MUTED}">ORDER REF</div>
                <div style="font-family:monospace;font-size:12px;color:${BRAND_LIGHT}">${orderRef}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <a href="${checkoutUrl}"
       style="display:inline-block;background:${BRAND_GREEN};color:#0d0b06;font-weight:700;
              font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none">
      Complete my booking
    </a>
    <p style="margin:20px 0 0 0;font-size:12px;color:${BRAND_MUTED}">
      Your cart is saved. Click the button to pick up exactly where you left off.
      Tickets are not reserved until payment is complete.
    </p>
  `;

  return sendMail({
    to,
    subject: `Complete your booking — ${event.title} · Sany Adventures`,
    html:    emailWrapper(content),
  });
}

// ── sendSupportRequestEmail ──────────────────────────────────
async function sendSupportRequestEmail({
  to, requesterName, requesterEmail, category, subject, message, orderRef, userRole,
}) {
  const safe = (v) => String(v || '').replace(/[<>&]/g, '');
  const content = `
    <h1 style="margin:0 0 10px 0;font-size:22px;font-weight:800;color:${BRAND_LIGHT}">
      New customer care request
    </h1>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND_BORDER}">
          <div style="font-size:11px;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.06em">From</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${safe(requesterName)} (${safe(requesterEmail)})</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND_BORDER}">
          <div style="font-size:11px;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.06em">Category</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${safe(category)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND_BORDER}">
          <div style="font-size:11px;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.06em">User role</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${safe(userRole || 'guest')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND_BORDER}">
          <div style="font-size:11px;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.06em">Order ref</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${safe(orderRef || 'N/A')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND_BORDER}">
          <div style="font-size:11px;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.06em">Subject</div>
          <div style="font-size:13px;color:${BRAND_LIGHT}">${safe(subject)}</div>
        </td>
      </tr>
    </table>
    <div style="font-size:11px;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.06em">Message</div>
    <div style="font-size:13px;color:${BRAND_LIGHT};line-height:1.6;white-space:pre-wrap;margin-top:6px">
      ${safe(message)}
    </div>
  `;

  return sendMail({
    to,
    replyTo: requesterEmail,
    subject: `[Support] ${subject}`,
    html: emailWrapper(content),
  });
}

module.exports = {
  sendTicketEmail,
  sendReminderEmail,
  sendResetEmail,
  sendRefundEmail,
  sendVerificationEmail,
  sendWaitlistEmail,
  sendAbandonmentEmail,
  sendSupportRequestEmail,
};
