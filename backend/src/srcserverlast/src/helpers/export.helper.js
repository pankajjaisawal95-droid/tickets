import PDFDocument from "pdfkit";

/**
 * Shared CSV / PDF export helpers for admin list pages.
 *
 * A "column" is { header, value(row) } — `value` returns the cell as a string.
 * Keeping the column list in the controller means each list decides its own
 * shape while the streaming/escaping logic lives here once.
 */

/** Escapes a value for a CSV field (wrap in quotes, double inner quotes). */
const csvEscape = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

/**
 * Streams `rows` as a CSV file download.
 * @param {object} res        Express response
 * @param {string} filename   e.g. "tickets-2026-06-03.csv"
 * @param {Array<{header:string, value:(row:any)=>string}>} columns
 * @param {Array} rows
 */
export const sendCsv = (res, { filename, columns, rows }) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => csvEscape(c.value(r))).join(","))
    .join("\r\n");

  // ﻿ (BOM) makes Excel open UTF-8 correctly.
  return res.send(`﻿${header}\r\n${body}`);
};

/**
 * Streams `rows` as a simple landscape PDF report (one text line per row).
 * @param {object} res
 * @param {string} filename
 * @param {string} title
 * @param {string} [subtitle]
 * @param {Array}  rows
 * @param {(row:any)=>string} line   one printable line per row
 * @param {string} [emptyText]
 */
export const sendPdf = (res, { filename, title, subtitle, rows, line, emptyText = "No records." }) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
  doc.pipe(res);

  doc.fontSize(16).text(title, { align: "left" });
  if (subtitle) doc.fontSize(9).fillColor("#666").text(subtitle);
  doc.moveDown(0.6).fillColor("#000");

  rows.forEach((r) => doc.fontSize(9).text(line(r)));
  if (!rows.length) doc.fontSize(11).text(emptyText);

  doc.end(); // ends the response when the stream flushes
};
