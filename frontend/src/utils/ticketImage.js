import { formatDate, formatTime } from "./serviceHelper.js";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/* ----------------------------- canvas helpers ----------------------------- */

/* Load an image so it can be drawn AND exported from the canvas (no taint).
   Strategy: fetch the bytes as a blob (works when the host allows CORS) and
   load from a same-origin blob: URL; fall back to a CORS <img>; never block
   the ticket on a failure. */
const loadFromUrl = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const fetchAsImage = async (src) => {
  try {
    const res = await fetch(src, { mode: "cors", cache: "reload" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
    URL.revokeObjectURL(url);
    return img;
  } catch {
    return null;
  }
};

const loadImage = async (src) => {
  if (!src) return null;

  // 1) fetch → blob → blob: URL  (cleanest; blob URLs never taint the canvas)
  const direct = await fetchAsImage(src);
  if (direct) return direct;

  // 2) CORS <img>, with a cache-bust to dodge a cached non-CORS response
  const bust = src + (src.includes("?") ? "&" : "?") + "cors=1";
  const viaImg = (await loadFromUrl(bust)) || (await loadFromUrl(src));
  if (viaImg) return viaImg;

  // 3) image proxy that re-serves the bytes with CORS headers (handles hosts
  //    that don't send Access-Control-Allow-Origin). Only useful for public
  //    URLs; localhost/private hosts are skipped.
  if (/^https?:\/\//i.test(src) && !/^https?:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/i.test(src)) {
    const proxied =
      "https://images.weserv.nl/?url=" +
      encodeURIComponent(src.replace(/^https?:\/\//i, ""));
    const viaProxy = (await fetchAsImage(proxied)) || (await loadFromUrl(proxied));
    if (viaProxy) return viaProxy;
  }

  return null;
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/* draw an image cropped to "cover" a target box */
const drawCover = (ctx, img, x, y, w, h) => {
  const ir = img.width / img.height;
  const r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / r;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

const wrapText = (ctx, text, maxWidth, maxLines = 2) => {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = line ? `${line} ${word}` : word;

    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;

      // on the last allowed line, fit the remaining words and ellipsize
      if (lines.length === maxLines - 1) {
        const rest = words.slice(i).join(" ");
        if (ctx.measureText(rest).width <= maxWidth) {
          lines.push(rest);
        } else {
          let clipped = rest;
          while (clipped && ctx.measureText(`${clipped}…`).width > maxWidth) {
            clipped = clipped.slice(0, -1);
          }
          lines.push(`${clipped}…`);
        }
        return lines;
      }
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
};

/* ----------------------------- ticket renderer ---------------------------- */

/**
 * Renders an attractive portrait ticket onto a canvas and returns it.
 *
 * @param {Object} ticket
 * @param {string} ticket.event
 * @param {string} ticket.start_datetime
 * @param {string} ticket.location
 * @param {number} ticket.qty
 * @param {string} ticket.image       event banner url
 * @param {string} ticket.qr          QR image url
 * @param {Array}  [ticket.ticketTypes]
 * @param {string|number} [ticket.id]
 */
export const renderTicketCanvas = async (ticket) => {
  const S = 2; // supersample for crisp text/QR
  const W = 720;

  /* ---- light theme palette ---- */
  const PAGE_BG = "#eef0f5";
  const CARD_BG = "#ffffff";
  const TEXT_DARK = "#18181b";
  const TEXT_MUTED = "#52525b";
  const TEXT_FAINT = "#71717a";
  const ACCENT = "#7c3aed";
  const BORDER = "rgba(0,0,0,0.10)";

  const M = 28; // outer margin
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const radius = 32;
  const px = cardX + 32; // content left pad
  const contentW = cardW - 64;
  const bannerH = 360;

  const notes = [
    "Carry a valid photo ID proof.",
    "Arrive at least 30 minutes before the event starts.",
    "Present the QR Code or Ticket PDF at entry.",
    "Do not share your ticket with anyone.",
    "Each QR Code is valid for one-time entry only.",
  ];

  // request a higher-res QR than the on-screen one
  const qrSrc = ticket.qr
    ? ticket.qr.replace(/size=\d+x\d+/, "size=420x420")
    : null;

  const [banner, qr] = await Promise.all([
    loadImage(ticket.image),
    loadImage(qrSrc),
  ]);

  /* ---------- measurement pass: figure out wrapped lines + total height ----- */
  const meas = document.createElement("canvas").getContext("2d");

  meas.font = "800 40px Arial, sans-serif";
  const titleLines = wrapText(meas, ticket.event, contentW, 2);

  meas.font = "500 20px Arial, sans-serif";
  const venueLines = wrapText(meas, "📍  " + (ticket.location || "Location TBA"), contentW, 2);

  const types = ticket.ticketTypes || [];
  const grandTotal = types.reduce((s, t) => {
    const count = Number(t.qty ?? (t.available_ticket || 0) + (t.used_ticket || 0)) || 0;
    return s + (t.price != null ? Number(t.price) * count : 0);
  }, 0);

  // Per-type assigned seats (SEATED types only). Pre-wrap so the height walk and
  // the draw pass agree.
  const SEAT_LH = 24;
  meas.font = "500 16px Arial, sans-serif";
  const typeSeatLines = types.map((t) =>
    t.seats ? wrapText(meas, "Seats: " + t.seats, contentW - 12, 2) : []
  );
  const totalSeatLines = typeSeatLines.reduce((s, l) => s + l.length, 0);

  // info box geometry
  const noteLH = 34;
  const infoPad = 24;
  const infoHeadH = 32;
  const infoBoxH = infoPad * 2 + infoHeadH + 8 + notes.length * noteLH;
  const qrPanel = 250;

  // walk the layout to compute the content's natural height
  let y = bannerH + 10;
  y += titleLines.length * 46;        // title
  y += 50;                            // date
  y += 34;                            // time
  y += 38 + (venueLines.length - 1) * 28; // venue
  if (types.length) {
    y += 44;                          // "TICKETS" label
    y += types.length * 34;           // rows
    y += totalSeatLines * SEAT_LH;    // assigned-seat lines (seated types)
    if (grandTotal > 0) y += 20 + 30; // divider + total
  }
  const contentBottom = y;

  // bottom stub stacks: perforation → QR → footer → meta → info box
  const perfGap = 40;
  const perfToQr = 34;
  const qrToFooter = 36;
  const footerToMeta = 30;
  const metaToInfo = 34;
  const bottomPad = 30;

  const perfY = cardY + contentBottom + perfGap;
  const qrY = perfY + perfToQr;
  const qrX = cardX + (cardW - qrPanel) / 2;
  const footerY = qrY + qrPanel + qrToFooter;
  const metaY = footerY + footerToMeta;
  const infoY = metaY + metaToInfo;

  const cardH = infoY + infoBoxH + bottomPad - cardY;
  const H = cardH + M * 2;

  /* ----------------------------- draw pass --------------------------------- */
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);
  ctx.textBaseline = "alphabetic";

  /* page backdrop */
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, W, H);

  // soft drop shadow under the card
  ctx.save();
  ctx.shadowColor = "rgba(17,17,40,0.18)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  ctx.restore();

  // clip everything to the card
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();

  /* ---- banner header ---- */
  if (banner) {
    drawCover(ctx, banner, cardX, cardY, cardW, bannerH);
  } else {
    const g = ctx.createLinearGradient(cardX, cardY, cardX, cardY + bannerH);
    g.addColorStop(0, "#6d28d9");
    g.addColorStop(1, "#db2777");
    ctx.fillStyle = g;
    ctx.fillRect(cardX, cardY, cardW, bannerH);
  }

  // gradient scrim fading the banner into the white card
  const scrim = ctx.createLinearGradient(0, cardY + bannerH - 200, 0, cardY + bannerH);
  scrim.addColorStop(0, "rgba(255,255,255,0)");
  scrim.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = scrim;
  ctx.fillRect(cardX, cardY + bannerH - 200, cardW, 200);

  // brand eyebrow pill
  ctx.font = "700 15px Arial, sans-serif";
  const pillTxt = "E-TICKET";
  const pillW = ctx.measureText(pillTxt).width + 28;
  roundRect(ctx, cardX + 28, cardY + 26, pillW, 32, 16);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(pillTxt, cardX + 28 + 14, cardY + 47);

  /* ---- content ---- */
  y = cardY + bannerH + 10;

  // title
  ctx.fillStyle = TEXT_DARK;
  ctx.font = "800 40px Arial, sans-serif";
  for (const line of titleLines) {
    y += 46;
    ctx.fillText(line, px, y);
  }

  // date row
  y += 50;
  ctx.fillStyle = ACCENT;
  ctx.font = "700 21px Arial, sans-serif";
  ctx.fillText("📅  " + formatDate(ticket.start_datetime), px, y);
  y += 34;
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = "600 20px Arial, sans-serif";
  ctx.fillText("🕑  " + formatTime(ticket.start_datetime), px, y);

  // venue
  y += 38;
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = "500 20px Arial, sans-serif";
  for (let i = 0; i < venueLines.length; i++) {
    if (i) y += 28;
    ctx.fillText(venueLines[i], px, y);
  }

  // ticket-type breakdown with prices (Silver ×2  ₹1000, …)
  if (types.length) {
    y += 44;
    ctx.fillStyle = ACCENT;
    ctx.font = "800 14px Arial, sans-serif";
    ctx.fillText("TICKETS", px, y);

    types.forEach((t, i) => {
      const count = Number(t.qty ?? (t.available_ticket || 0) + (t.used_ticket || 0)) || 0;
      const lineTotal = t.price != null ? Number(t.price) * count : null;

      y += 34;
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = "600 19px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${t.name}  ×${count}`, px, y);

      if (lineTotal != null) {
        ctx.fillStyle = TEXT_DARK;
        ctx.font = "800 19px Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(inr(lineTotal), px + contentW, y);
      }

      // assigned seats for SEATED ticket types
      const sLines = typeSeatLines[i];
      if (sLines.length) {
        ctx.textAlign = "left";
        ctx.fillStyle = TEXT_FAINT;
        ctx.font = "500 16px Arial, sans-serif";
        for (const sl of sLines) {
          y += SEAT_LH;
          ctx.fillText(sl, px + 12, y);
        }
      }
    });
    ctx.textAlign = "left";

    if (grandTotal > 0) {
      y += 20;
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + contentW, y);
      ctx.stroke();

      y += 30;
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = "700 18px Arial, sans-serif";
      ctx.fillText("Total", px, y);
      ctx.fillStyle = TEXT_DARK;
      ctx.font = "800 22px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(inr(grandTotal), px + contentW, y);
      ctx.textAlign = "left";
    }
  }

  /* ---- perforation ---- */
  ctx.fillStyle = PAGE_BG;
  ctx.beginPath();
  ctx.arc(cardX, perfY, 20, 0, Math.PI * 2);
  ctx.arc(cardX + cardW, perfY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(cardX + 34, perfY);
  ctx.lineTo(cardX + cardW - 34, perfY);
  ctx.stroke();
  ctx.setLineDash([]);

  /* ---- QR panel ---- */
  roundRect(ctx, qrX, qrY, qrPanel, qrPanel, 24);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  roundRect(ctx, qrX, qrY, qrPanel, qrPanel, 24);
  ctx.stroke();

  if (qr) {
    const pad = 20;
    ctx.drawImage(qr, qrX + pad, qrY + pad, qrPanel - pad * 2, qrPanel - pad * 2);
  } else {
    ctx.fillStyle = "#111";
    ctx.font = "600 16px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("QR unavailable", qrX + qrPanel / 2, qrY + qrPanel / 2);
    ctx.textAlign = "left";
  }

  // footer text under QR
  ctx.textAlign = "center";
  ctx.fillStyle = TEXT_DARK;
  ctx.font = "700 20px Arial, sans-serif";
  ctx.fillText("Scan this QR at the entry gate", cardX + cardW / 2, footerY);

  ctx.fillStyle = TEXT_FAINT;
  ctx.font = "500 16px Arial, sans-serif";
  const meta = [
    ticket.qty ? `${ticket.qty} ticket${ticket.qty > 1 ? "s" : ""}` : null,
    ticket.ticketNo ? `Booking ${ticket.ticketNo}` : ticket.id ? `Booking #${ticket.id}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (meta) ctx.fillText(meta, cardX + cardW / 2, metaY);
  ctx.textAlign = "left";

  /* ---- important information ---- */
  const infoX = px;
  const infoW = contentW;
  roundRect(ctx, infoX, infoY, infoW, infoBoxH, 16);
  ctx.fillStyle = "#fff7ed"; // soft amber tint
  ctx.fill();
  ctx.strokeStyle = "rgba(217,119,6,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, infoX, infoY, infoW, infoBoxH, 16);
  ctx.stroke();

  let iy = infoY + infoPad + 20;
  const itx = infoX + infoPad;

  // heading
  ctx.fillStyle = "#b45309";
  ctx.font = "800 19px Arial, sans-serif";
  ctx.fillText("⚠  Important Information", itx, iy);

  // bullet list
  for (const note of notes) {
    iy += noteLH;
    ctx.fillStyle = "#d97706";
    ctx.font = "800 17px Arial, sans-serif";
    ctx.fillText("•", itx, iy);
    ctx.fillStyle = "#7c2d12";
    ctx.font = "500 17px Arial, sans-serif";
    ctx.fillText(note, itx + 20, iy);
  }

  ctx.restore(); // un-clip

  return canvas;
};

const ticketFileName = (ticket) =>
  (String(ticket.event || "ticket")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .toLowerCase() || "ticket") + ".png";

const canvasToBlob = (canvas) =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Generates the ticket image and triggers a PNG download.
 */
export const downloadTicket = async (ticket) => {
  const canvas = await renderTicketCanvas(ticket);
  const blob = await canvasToBlob(canvas);
  if (blob) downloadBlob(blob, ticketFileName(ticket));
};

/**
 * Shares the ticket as an image via the Web Share API (mobile → WhatsApp/etc.).
 * Falls back to a text-only share, and finally to a plain download when the
 * browser can't share files (most desktops). The ticket is auth-gated so there
 * is no public link to share — we share the rendered image itself.
 *
 * @returns {Promise<{shared:boolean, cancelled?:boolean, downloaded?:boolean}>}
 */
export const shareTicket = async (ticket) => {
  const canvas = await renderTicketCanvas(ticket);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error("Could not render ticket");

  const name = ticketFileName(ticket);
  const title = ticket.event ? `Ticket · ${ticket.event}` : "My Ticket";
  const text = ticket.event
    ? `My ticket for ${ticket.event}${ticket.start_datetime ? ` on ${formatDate(ticket.start_datetime)}` : ""} 🎟️`
    : "My event ticket 🎟️";

  // 1) Best path: share the image file (mobile, some desktops)
  try {
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return { shared: true };
    }
  } catch (e) {
    if (e?.name === "AbortError") return { shared: false, cancelled: true };
    // fall through to other options
  }

  // 2) Text-only share (no file support but Web Share exists)
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return { shared: true };
    } catch (e) {
      if (e?.name === "AbortError") return { shared: false, cancelled: true };
    }
  }

  // 3) Fallback: download the image so the user can attach it manually
  downloadBlob(blob, name);
  return { shared: false, downloaded: true };
};
