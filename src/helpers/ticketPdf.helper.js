import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

/* ------------------------------ shared helpers ----------------------------- */

const fmtDay = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : '-';

const fmtClock = (d) =>
  d
    ? new Date(d).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : '';

// Helvetica (WinAnsi) has no ₹ glyph, so use "Rs." in the PDF.
const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Best-effort fetch of the banner image as a Buffer for embedding.
 * Tries an absolute URL, then a few local asset paths. Returns null on failure
 * (caller draws a solid header instead). PDFKit embeds JPEG/PNG only.
 */
const loadBanner = async (banner) => {
  if (!banner) return null;
  try {
    if (/^https?:\/\//i.test(banner)) {
      const res = await axios.get(banner, { responseType: 'arraybuffer', timeout: 5000 });
      return Buffer.from(res.data);
    }
    const rel = String(banner).replace(/^\/+/, '');
    const candidates = [
      path.resolve(process.cwd(), rel),
      path.resolve(process.cwd(), 'src', rel),
      path.resolve(process.cwd(), 'assets', path.basename(rel))
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    }
  } catch {
    /* fall through to null */
  }
  return null;
};

/* ------------------------------ PDF renderer ------------------------------- */

/**
 * Renders an attractive single-page ticket PDF and resolves to a Buffer.
 *
 * @param {Object} opts
 * @param {Object} opts.contact    { name, email, whatsapp_no }
 * @param {Object} opts.event      { title, venue, start_datetime, banner_url }
 * @param {Object} opts.ticket     { ticketId, qrCode, totalSlots }
 * @param {Array}  [opts.breakdown] [{ name, quantity, unit_price, line_total }]
 */
export const generateTicketPdf = async ({ contact, event, ticket, breakdown = [] }) => {
  const W = 400;
  const H = 700;
  const PAD = 28;

  const [bannerBuf, qrBuf] = await Promise.all([
    loadBanner(event?.banner_url),
    ticket?.qrCode
      ? QRCode.toBuffer(ticket.qrCode, { width: 360, margin: 1 }).catch(() => null)
      : Promise.resolve(null)
  ]);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [W, H], margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      /* card background */
      doc.rect(0, 0, W, H).fill('#12121c');

      /* banner */
      const bannerH = 170;
      if (bannerBuf) {
        try {
          doc.save();
          doc.rect(0, 0, W, bannerH).clip();
          doc.image(bannerBuf, 0, 0, { cover: [W, bannerH], align: 'center', valign: 'center' });
          doc.restore();
        } catch {
          doc.rect(0, 0, W, bannerH).fill('#6d28d9');
        }
      } else {
        doc.rect(0, 0, W, bannerH).fill('#6d28d9');
      }
      // scrim
      doc.rect(0, bannerH - 60, W, 60).fill('#12121c').fillOpacity(1);

      let y = bannerH + 18;

      /* eyebrow + title */
      doc.fillColor('#c4b5fd').font('Helvetica-Bold').fontSize(10)
        .text('E-TICKET', PAD, y, { characterSpacing: 2 });
      y += 16;
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
        .text(event?.title || 'Your event', PAD, y, { width: W - PAD * 2 });
      y = doc.y + 10;

      /* date / venue */
      doc.font('Helvetica').fontSize(11);
      doc.fillColor('#c4b5fd').text(fmtDay(event?.start_datetime), PAD, y);
      y = doc.y + 2;
      doc.fillColor('#a1a1aa').text(fmtClock(event?.start_datetime), PAD, y);
      y = doc.y + 2;
      doc.fillColor('#e4e4e7').text(event?.venue || 'Venue TBA', PAD, y, { width: W - PAD * 2 });
      y = doc.y + 14;

      /* dashed divider */
      doc.save().lineWidth(1).strokeColor('#3f3f46').dash(4, { space: 4 })
        .moveTo(PAD, y).lineTo(W - PAD, y).stroke().undash().restore();
      y += 16;

      /* breakdown table */
      doc.fillColor('#71717a').font('Helvetica-Bold').fontSize(9)
        .text('TICKETS', PAD, y, { characterSpacing: 1 });
      y += 16;

      doc.font('Helvetica').fontSize(12);
      for (const row of breakdown) {
        const qty = Number(row.quantity) || 0;
        doc.fillColor('#e4e4e7').text(`${row.name}  x${qty}`, PAD, y, {
          width: W - PAD * 2 - 90,
          continued: false
        });
        doc.fillColor('#e4e4e7').font('Helvetica-Bold')
          .text(money(row.line_total), W - PAD - 90, y, { width: 90, align: 'right' });
        doc.font('Helvetica');
        let rowBottom = doc.y;
        // assigned seats for SEATED ticket types
        if (row.seats) {
          doc.fillColor('#a1a1aa').fontSize(9)
            .text(`Seats: ${row.seats}`, PAD + 8, rowBottom, { width: W - PAD * 2 - 16 });
          doc.fontSize(12);
          rowBottom = doc.y;
        }
        y = rowBottom + 6;
      }

      /* total */
      const total = breakdown.reduce((s, r) => s + Number(r.line_total || 0), 0);
      y += 4;
      doc.save().lineWidth(1).strokeColor('#27272a')
        .moveTo(PAD, y).lineTo(W - PAD, y).stroke().restore();
      y += 10;
      doc.fillColor('#a1a1aa').font('Helvetica-Bold').fontSize(12)
        .text('Total', PAD, y, { width: 120 });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
        .text(money(total), W - PAD - 120, y - 1, { width: 120, align: 'right' });
      y += 26;

      /* QR panel */
      if (qrBuf) {
        const qrSize = 150;
        const panel = qrSize + 28;
        const px = (W - panel) / 2;
        doc.roundedRect(px, y, panel, panel, 14).fill('#ffffff');
        doc.image(qrBuf, px + 14, y + 14, { width: qrSize, height: qrSize });
        y += panel + 12;
      }

      doc.fillColor('#e4e4e7').font('Helvetica-Bold').fontSize(11)
        .text('Scan this QR at the entry gate', PAD, y, { width: W - PAD * 2, align: 'center' });
      y = doc.y + 4;
      const count = Number(ticket?.totalSlots) || 0;
      doc.fillColor('#a1a1aa').font('Helvetica').fontSize(10)
        .text(`Booking #${ticket?.ticketId}   -   ${count} ticket${count === 1 ? '' : 's'}`,
          PAD, y, { width: W - PAD * 2, align: 'center' });
      y = doc.y + 14;

      /* contact */
      doc.save().lineWidth(1).strokeColor('#1f1f29')
        .moveTo(PAD, y).lineTo(W - PAD, y).stroke().restore();
      y += 10;
      doc.fillColor('#71717a').font('Helvetica-Bold').fontSize(9)
        .text('CONTACT', PAD, y, { characterSpacing: 1 });
      y = doc.y + 4;
      doc.fillColor('#e4e4e7').font('Helvetica').fontSize(11);
      if (contact?.name) { doc.text(contact.name, PAD, y); y = doc.y; }
      if (contact?.email) { doc.text(contact.email, PAD, y); y = doc.y; }
      if (contact?.whatsapp_no) { doc.text(`WhatsApp: ${contact.whatsapp_no}`, PAD, y); }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
