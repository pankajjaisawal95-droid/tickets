import {
  listTicketsService,
  listTicketsForExport,
  listEventScansService,
  getScanAnalyticsService
} from "../services/adminTicket.service.js";
import { success, error } from "../helpers/response.helper.js";
import { sendCsv, sendPdf } from "../helpers/export.helper.js";

export const listTickets = async (req, res) => {
  try {
    return success(res, await listTicketsService(req.query), "Tickets fetched");
  } catch (err) { return error(res, err.message, 400); }
};

/** CSV column map for the ticket export. */
const TICKET_COLUMNS = [
  { header: "Ticket ID", value: (r) => r.id },
  { header: "Order ID", value: (r) => r.order_id ?? "" },
  { header: "Event", value: (r) => r.event_title ?? `#${r.event_id}` },
  { header: "Event Date", value: (r) => (r.event_start ? new Date(r.event_start).toISOString() : "") },
  { header: "Presented By", value: (r) => r.presented_by ?? "" },
  { header: "Ticket Type", value: (r) => r.ticket_type_name ?? "" },
  { header: "Customer", value: (r) => r.user_name ?? "" },
  { header: "Mobile", value: (r) => r.mobile ?? "" },
  { header: "Email", value: (r) => r.email ?? "" },
  { header: "Status", value: (r) => r.status ?? "" },
  { header: "Available", value: (r) => r.available_ticket ?? "" },
  { header: "Used", value: (r) => r.used_ticket ?? "" },
  { header: "Used At", value: (r) => (r.used_at ? new Date(r.used_at).toISOString() : "") },
  { header: "Issued At", value: (r) => new Date(r.created_at).toISOString() },
];

/**
 * GET /admin/tickets/export?format=csv|pdf
 * Same filters as the list (search, event_id, status, ticket_type_id, from, to).
 */
export const exportTickets = async (req, res) => {
  try {
    const rows = await listTicketsForExport(req.query);
    const stamp = new Date().toISOString().slice(0, 10);

    if (req.query.format === "pdf") {
      return sendPdf(res, {
        filename: `tickets-${stamp}.pdf`,
        title: "Tickets Report",
        subtitle: `Generated ${new Date().toISOString()}  •  ${rows.length} tickets`,
        rows,
        line: (r) =>
          `#${r.id}  ${new Date(r.created_at).toLocaleString("en-IN")}  •  ` +
          `${r.event_title || `Event #${r.event_id}`}  •  ${r.ticket_type_name || "-"}  •  ` +
          `${r.user_name || r.mobile || "guest"}  •  ${r.status}  •  ` +
          `avail ${r.available_ticket ?? "-"} / used ${r.used_ticket ?? "-"}`,
        emptyText: "No tickets found.",
      });
    }

    return sendCsv(res, { filename: `tickets-${stamp}.csv`, columns: TICKET_COLUMNS, rows });
  } catch (err) {
    console.error("exportTickets error:", err.message);
    return error(res, err.message, 400);
  }
};

export const listEventScans = async (req, res) => {
  try {
    return success(res, await listEventScansService(req.params.id, req.query), "Scans fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getScanAnalytics = async (req, res) => {
  try {
    return success(res, await getScanAnalyticsService(req.params.id), "Scan analytics fetched");
  } catch (err) { return error(res, err.message, 400); }
};
