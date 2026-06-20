import QRCode from 'qrcode';
import { getTransporter } from '../config/mailer.js';
import { logEmail } from '../services/emailHistory.service.js';
import { generateTicketPdf } from './ticketPdf.helper.js';

/**
 * Low-level email sender.
 *
 * Background safe: never throws (mirrors sendSms in sms.helper.js) so a mail
 * failure can't break the request that triggered it. Returns true/false.
 *
 * @param {Object}  opts
 * @param {string|string[]} opts.to        recipient(s)
 * @param {string}  opts.subject
 * @param {string} [opts.html]
 * @param {string} [opts.text]
 * @param {Array}  [opts.attachments]      nodemailer attachment objects
 * @param {Object} [opts.meta]             email_history context: { emailType, orderId, eventId, userId, ticketId }
 */
export const sendEmail = async ({ to, subject, html, text, attachments, meta = {} }) => {
  try {
    if (!to || !subject || (!html && !text)) {
      throw new Error('Missing required fields in sendEmail (to, subject, html/text)');
    }

    const transporter = getTransporter();
    if (!transporter) {
      // SMTP not configured — record as skipped so the gap is auditable
      logEmail({ ...meta, recipient: to, subject, status: 'SKIPPED', errorMessage: 'SMTP not configured' });
      return false;
    }

    const from =
      process.env.SMTP_FROM ||
      `"Tickets" <${process.env.SMTP_USER}>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments
    });

    console.log('✉️  Email sent:', info.messageId);
    logEmail({ ...meta, recipient: to, subject, status: 'SENT', messageId: info.messageId });
    return true;
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    logEmail({ ...meta, recipient: to, subject, status: 'FAILED', errorMessage: err.message });
    return false; // never throw, background safe
  }
};

/**
 * Formats a MySQL datetime for display in IST.
 */
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : '—';

/* "Sat, 30 May 2026" */
const fmtDay = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : '—';

/* "06:00 PM" */
const fmtClock = (d) =>
  d
    ? new Date(d).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : '';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Resolves a banner path to an absolute, email-reachable URL.
 * Relative paths are prefixed with PUBLIC_ASSET_URL (or BASE_URL).
 * Returns null when it can't be made absolute (caller shows a gradient).
 */
const resolveBannerUrl = (banner) => {
  if (!banner) return null;
  if (/^https?:\/\//i.test(banner)) return banner;

  const base = (process.env.PUBLIC_ASSET_URL || process.env.BASE_URL || '').replace(/\/+$/, '');
  if (!base || /localhost|127\.0\.0\.1/i.test(base)) return null; // not publicly reachable
  return `${base}/${String(banner).replace(/^\/+/, '')}`;
};

/**
 * Builds the email-safe (table + inline styles) ticket HTML, mirroring the
 * downloadable ticket design. Pure — no I/O — so it can be previewed/tested.
 *
 * @param {Object} opts
 * @param {Object} opts.contact  { name, email, whatsapp_no }
 * @param {Object} opts.event    { title, venue, start_datetime, banner_url }
 * @param {Object} opts.ticket   { ticketId, totalSlots }
 * @param {string} [opts.qrCid]  content-id of the embedded QR image
 */
/**
 * Branded announcement email — a free-text message from the organiser wrapped in
 * a simple banner + body. Used by the admin "email attendees" broadcast.
 */
export const buildAnnouncementHtml = ({ subject, message }) => {
  // Only the admin's subject (as the heading) and message (as the body) — no
  // auto-added greeting, event branding, or signature.
  const body = esc(message).replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f4f5fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:14px;padding:28px;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${esc(subject)}</h1>
      <div style="font-size:15px;line-height:1.6;color:#374151;">${body}</div>
    </div>
  </div>
</body></html>`;
};

/** Public site base for links/buttons (null when only localhost is configured). */
const publicBase = () => {
  const base = (process.env.PUBLIC_ASSET_URL || process.env.BASE_URL || '').replace(/\/+$/, '');
  if (!base || /localhost|127\.0\.0\.1/i.test(base)) return null;
  return base;
};

export const buildTicketEmailHtml = ({ contact, event, ticket, qrCid, breakdown = [] }) => {
  const bannerUrl = resolveBannerUrl(event?.banner_url);
  const ticketCount = Number(ticket?.totalSlots) || 0;
  const total = breakdown.reduce((s, r) => s + Number(r.line_total || 0), 0);
  const hasPrices = breakdown.some((r) => Number(r.line_total) > 0);
  const site = publicBase();

  const summaryRows = (breakdown.length
    ? breakdown
    : [{ name: 'Ticket', quantity: ticketCount, line_total: 0 }]
  )
    .map(
      (r) => `
      <tr>
        <td style="padding:14px;border-top:1px solid #e5e7eb;color:#111827;">${esc(r.name)}${
          r.seats ? `<br><span style="font-size:12px;color:#6b7280;">Seats: ${esc(r.seats)}</span>` : ''
        }</td>
        <td align="center" style="padding:14px;border-top:1px solid #e5e7eb;color:#111827;">${Number(r.quantity) || 0}</td>
        ${hasPrices ? `<td align="right" style="padding:14px;border-top:1px solid #e5e7eb;color:#111827;font-weight:600;">${money(r.line_total)}</td>` : ''}
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb;padding:30px 15px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td align="center" bgcolor="#1e88e5" style="padding:40px 30px;background:#1e88e5;background:linear-gradient(135deg,#0f4c81,#1e88e5);">
      <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:800;">🎟 Ticket Confirmed</h1>
      <p style="margin:10px 0 0;color:#ffffff;font-size:15px;opacity:.9;">Your booking has been successfully confirmed</p>
    </td>
  </tr>

  ${bannerUrl ? `<!-- BANNER -->
  <tr><td><img src="${esc(bannerUrl)}" alt="${esc(event?.title)}" width="600" style="display:block;width:100%;height:auto;"></td></tr>` : ''}

  <!-- GREETING -->
  <tr>
    <td style="padding:30px;">
      <p style="margin:0;font-size:16px;color:#111827;">Namaste <strong>${esc(contact?.name) || 'Guest'}</strong>,</p>
      <p style="margin:15px 0 0;font-size:15px;line-height:1.8;color:#6b7280;">
        Thank you for booking with us. Your tickets for <strong>${esc(event?.title) || 'the event'}</strong> have been successfully confirmed.
      </p>
    </td>
  </tr>

  <!-- EVENT DETAILS -->
  <tr>
    <td style="padding:0 30px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;border:1px solid #e5e7eb;">
        <tr><td colspan="2" style="font-size:18px;font-weight:700;color:#111827;padding:20px 20px 6px;">📋 Event Details</td></tr>
        <tr><td style="padding:8px 20px;color:#6b7280;">Event</td><td style="padding:8px 20px;font-weight:600;color:#111827;">${esc(event?.title)}</td></tr>
        <tr><td style="padding:8px 20px;color:#6b7280;">Date</td><td style="padding:8px 20px;font-weight:600;color:#111827;">${esc(fmtDay(event?.start_datetime))}</td></tr>
        <tr><td style="padding:8px 20px;color:#6b7280;">Time</td><td style="padding:8px 20px;font-weight:600;color:#111827;">${esc(fmtClock(event?.start_datetime))}</td></tr>
        <tr><td style="padding:8px 20px;color:#6b7280;">Venue</td><td style="padding:8px 20px;font-weight:600;color:#111827;">${esc(event?.venue) || 'Venue TBA'}</td></tr>
        <tr><td style="padding:8px 20px;color:#6b7280;">Booking ID</td><td style="padding:8px 20px;font-weight:600;color:#111827;">#${esc(ticket?.ticketId)}</td></tr>
        <tr><td style="padding:8px 20px 20px;color:#6b7280;">Tickets</td><td style="padding:8px 20px 20px;font-weight:600;color:#111827;">${ticketCount} ticket${ticketCount === 1 ? '' : 's'}</td></tr>
      </table>
    </td>
  </tr>

  <!-- TICKET SUMMARY -->
  <tr>
    <td style="padding:25px 30px 10px;">
      <h3 style="margin:0 0 15px;color:#111827;">🎫 Ticket Summary</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:14px;color:#374151;">Ticket Type</th>
          <th align="center" style="padding:14px;color:#374151;">Qty</th>
          ${hasPrices ? `<th align="right" style="padding:14px;color:#374151;">Amount</th>` : ''}
        </tr>
        ${summaryRows}
        ${hasPrices ? `<tr style="background:#f8fafc;">
          <td style="padding:14px;font-weight:700;color:#111827;" ${'colspan="2"'}>Total</td>
          <td align="right" style="padding:14px;font-weight:800;color:#0f4c81;">${money(total)}</td>
        </tr>` : ''}
      </table>
    </td>
  </tr>

  ${qrCid ? `<!-- QR CODE -->
  <tr>
    <td align="center" style="padding:30px;">
      <img src="cid:${qrCid}" width="180" height="180" alt="QR Code" style="background:#fff;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
      <p style="margin:15px 0 0;color:#6b7280;font-size:14px;">Scan this QR code at the entry gate</p>
    </td>
  </tr>` : ''}

  <!-- PDF NOTE -->
  <tr>
    <td align="center" style="padding:0 30px 30px;">
      <p style="font-size:14px;color:#6b7280;margin:0 0 ${site ? '18px' : '0'};">Your ticket PDF is attached with this email.</p>
      ${site ? `<a href="${site}/my-tickets" style="display:inline-block;background:#1e88e5;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:10px;font-weight:700;font-size:14px;">📄 View My Tickets</a>` : ''}
    </td>
  </tr>

  <!-- IMPORTANT INFO -->
  <tr>
    <td style="padding:0 30px 30px;">
      <div style="background:#fff8e7;padding:20px;border-radius:14px;border-left:5px solid #f59e0b;">
        <h3 style="margin:0 0 15px;color:#111827;">⚠ Important Information</h3>
        <ul style="margin:0;padding-left:20px;color:#6b7280;line-height:1.9;">
          <li>Please carry a valid photo ID proof.</li>
          <li>Arrive at least 30 minutes before the event starts.</li>
          <li>Present the QR Code or Ticket PDF at entry.</li>
          <li>Do not share your ticket with anyone.</li>
          <li>Each QR Code is valid for one-time entry only.</li>
        </ul>
      </div>
    </td>
  </tr>

  <!-- CONTACT ON FILE -->
  <tr>
    <td style="padding:0 30px 30px;">
      <h3 style="margin:0 0 12px;color:#111827;">👤 Your Details</h3>
      <p style="margin:0;color:#6b7280;line-height:1.8;">
        ${esc(contact?.name) ? `${esc(contact?.name)}<br>` : ''}
        ${esc(contact?.email)}${esc(contact?.whatsapp_no) ? `<br>WhatsApp: ${esc(contact?.whatsapp_no)}` : ''}
      </p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td align="center" bgcolor="#111827" style="background:#111827;padding:36px 30px;">
      <h2 style="margin:0;color:#ffffff;">Ticket Sanskar</h2>
      <p style="margin:15px 0 0;color:#d1d5db;line-height:1.8;">We look forward to welcoming you to the event.</p>
      <p style="margin:15px 0 0;color:#9ca3af;line-height:1.7;font-size:13px;">
        support@ticket.sanskargroup.in${site ? `<br>${esc(site)}` : ''}
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#6b7280;">© 2026 Ticket Sanskar. All rights reserved.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
};

/**
 * Sends the ticket confirmation email: the booker's contact details
 * alongside the event details and a scannable QR code.
 *
 * Background-safe — delegates to sendEmail (which never throws) and any
 * QR-generation error is swallowed so it can't break ticket creation.
 *
 * @param {Object} opts
 * @param {Object} opts.contact  { name, email, whatsapp_no }
 * @param {Object} opts.event    { title, venue, start_datetime, end_datetime, banner_url }
 * @param {Object} opts.ticket   { ticketId, qrCode, qrHash, totalSlots }
 * @param {Array}  [opts.breakdown] [{ name, quantity, unit_price, line_total }]
 * @param {Object} [opts.meta]   email_history context: { orderId, eventId, userId }
 */
export const sendTicketEmail = async ({ contact, event, ticket, breakdown = [], meta = {} }) => {
  if (!contact?.email) return false;

  const attachments = [];
  let qrCid;

  // Inline QR for the HTML body
  try {
    if (ticket?.qrCode) {
      const buffer = await QRCode.toBuffer(ticket.qrCode, { width: 240, margin: 1 });
      qrCid = 'ticket-qr';
      attachments.push({ filename: 'ticket-qr.png', content: buffer, cid: qrCid });
    }
  } catch (qrErr) {
    console.error('❌ QR generation for email failed:', qrErr.message);
  }

  // Attractive PDF ticket attachment (server-generated)
  try {
    const pdf = await generateTicketPdf({ contact, event, ticket, breakdown });
    if (pdf?.length) {
      attachments.push({
        filename: `ticket-${ticket?.ticketId || 'booking'}.pdf`,
        content: pdf,
        contentType: 'application/pdf'
      });
    }
  } catch (pdfErr) {
    console.error('❌ Ticket PDF generation failed:', pdfErr.message);
  }

  const ticketCount = Number(ticket?.totalSlots) || 0;
  const html = buildTicketEmailHtml({ contact, event, ticket, qrCid, breakdown });

  const text =
    `Your ticket is confirmed (Booking #${ticket?.ticketId})\n\n` +
    `Event: ${event?.title}\nVenue: ${event?.venue}\n` +
    `When: ${fmtDay(event?.start_datetime)} ${fmtClock(event?.start_datetime)}\n` +
    `Tickets: ${ticketCount}\n\n` +
    `Contact:\n` +
    `Name: ${contact?.name}\nEmail: ${contact?.email}\nWhatsApp: ${contact?.whatsapp_no}\n\n` +
    `Show the attached/embedded QR at the entry gate. Do not share it.\n`;

  return sendEmail({
    to: contact.email,
    subject: `🎟️ Ticket confirmed — ${event?.title || 'Your event'}`,
    html,
    text,
    attachments,
    meta: { emailType: 'TICKET_CONFIRMATION', ticketId: ticket?.ticketId, ...meta }
  });
};

/**
 * Sends the cancellation + refund confirmation email. Background-safe.
 *
 * @param {Object} opts
 * @param {Object} opts.contact   { name, email, whatsapp_no }
 * @param {Object} opts.event     { title, venue, start_datetime }
 * @param {Object} opts.ticket    { ticketId }
 * @param {Array}  [opts.breakdown] [{ name, quantity, line_total }]
 * @param {Object} [opts.refund]  { amount, status } | null (free ticket)
 * @param {Object} [opts.meta]    email_history context
 */
export const sendCancellationEmail = async ({ contact, event, ticket, breakdown = [], refund = null, meta = {} }) => {
  if (!contact?.email) return false;

  const rows = breakdown
    .map(
      (r) => `<tr>
        <td style="padding:6px 0;color:#e4e4e7;font-size:14px;">${esc(r.name)} <span style="color:#a1a1aa;">×${Number(r.quantity) || 0}</span></td>
        <td align="right" style="padding:6px 0;color:#a1a1aa;font-size:14px;text-decoration:line-through;">${money(r.line_total)}</td>
      </tr>`
    )
    .join('');

  const refundBlock = refund
    ? `<tr><td style="padding:14px 28px 0;">
         <div style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:14px 16px;">
           <div style="color:#86efac;font-size:13px;font-weight:700;">REFUND ${esc(refund.status || 'INITIATED')}</div>
           <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">${money(refund.amount)}</div>
           <div style="color:#a1a1aa;font-size:13px;margin-top:4px;">Credited to your original payment method in 5–7 business days.</div>
         </div>
       </td></tr>`
    : `<tr><td style="padding:14px 28px 0;color:#a1a1aa;font-size:13px;">This was a free ticket — no payment to refund.</td></tr>`;

  const html = `
  <div style="background:#0b0b12;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" align="center" width="480" cellpadding="0" cellspacing="0" border="0"
           style="width:480px;max-width:480px;margin:0 auto;background:#12121c;border-radius:20px;overflow:hidden;">
      <tr><td height="6" style="height:6px;background:#ef4444;"></td></tr>
      <tr><td style="padding:22px 28px 0;">
        <div style="color:#fca5a5;font-size:12px;letter-spacing:2px;font-weight:700;">BOOKING CANCELLED</div>
        <div style="margin:8px 0 0;color:#ffffff;font-size:22px;line-height:1.25;font-weight:700;">${esc(event?.title) || 'Your event'}</div>
      </td></tr>
      <tr><td style="padding:12px 28px 0;font-size:14px;line-height:1.6;">
        <div style="color:#a1a1aa;">📅&nbsp; ${esc(fmtDay(event?.start_datetime))} · ${esc(fmtClock(event?.start_datetime))}</div>
        <div style="color:#e4e4e7;margin-top:4px;">📍&nbsp; ${esc(event?.venue) || 'Venue TBA'}</div>
        <div style="color:#71717a;margin-top:6px;">Booking #${esc(ticket?.ticketId)}</div>
      </td></tr>
      ${rows ? `<tr><td style="padding:14px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>` : ''}
      ${refundBlock}
      <tr><td style="padding:20px 28px 0;"><div style="border-top:1px solid rgba(255,255,255,0.08);font-size:0;line-height:0;">&nbsp;</div></td></tr>
      <tr><td style="padding:12px 28px 24px;color:#71717a;font-size:12px;">Your QR code is now void. If this wasn't you, contact support immediately.</td></tr>
    </table>
  </div>`;

  const text =
    `Booking cancelled (Booking #${ticket?.ticketId})\n` +
    `Event: ${event?.title}\nWhen: ${fmtDay(event?.start_datetime)} ${fmtClock(event?.start_datetime)}\n\n` +
    (refund
      ? `Refund ${refund.status || 'INITIATED'}: ${money(refund.amount)} — 5-7 business days to your original payment method.\n`
      : `Free ticket — no payment to refund.\n`);

  return sendEmail({
    to: contact.email,
    subject: `❌ Booking cancelled — ${event?.title || 'Your event'}`,
    html,
    text,
    meta: { emailType: 'TICKET_CANCELLATION', ticketId: ticket?.ticketId, ...meta }
  });
};
