import { success, error } from "../helpers/response.helper.js";
import { sendCsv, sendPdf } from "../helpers/export.helper.js";
import {
  createContactMessage,
  listContactMessages,
  getContactsForExport,
  setContactReadStatus,
} from "../services/contact.service.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public. Stores a message submitted from the "Contact Us" page.
 * Body: { name, email, mobile?, message }
 */
export const submitContact = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").trim();
    const mobile = (req.body?.mobile || "").trim();
    const message = (req.body?.message || "").trim();

    if (!name || !email || !message) {
      return error(res, "Name, email and message are required", 422);
    }
    if (!EMAIL_RE.test(email)) {
      return error(res, "Please enter a valid email address", 422);
    }

    const id = await createContactMessage({
      name,
      email,
      mobile: mobile || null,
      message,
      ip: req.geo?.ip || req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    return success(res, { id }, "Message received. We'll get back to you shortly.", 201);
  } catch (err) {
    console.error("submitContact error:", err.message);
    return error(res, "Could not send your message. Please try again later.", 500);
  }
};

/**
 * Admin. Paginated list of contact messages.
 * Query: limit, offset, search, is_read
 */
export const listContacts = async (req, res) => {
  try {
    const { limit, offset, search, is_read } = req.query;
    const result = await listContactMessages({ limit, offset, search, is_read });
    return success(res, result, "Contact messages fetched");
  } catch (err) {
    console.error("listContacts error:", err.message);
    return error(res, "Could not load contact messages", 500);
  }
};

/** Admin. Marks a message read / unread. Body: { is_read } */
export const updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const isRead = req.body?.is_read === undefined ? true : !!req.body.is_read;
    const ok = await setContactReadStatus(id, isRead);
    if (!ok) return error(res, "Message not found", 404);
    return success(res, { id: Number(id), is_read: isRead ? 1 : 0 }, "Status updated");
  } catch (err) {
    console.error("updateContactStatus error:", err.message);
    return error(res, "Could not update message", 500);
  }
};

/** CSV column map for the contact export. */
const CONTACT_COLUMNS = [
  { header: "ID", value: (r) => r.id },
  { header: "Received At", value: (r) => new Date(r.created_at).toISOString() },
  { header: "Name", value: (r) => r.name ?? "" },
  { header: "Email", value: (r) => r.email ?? "" },
  { header: "Mobile", value: (r) => r.mobile ?? "" },
  { header: "Message", value: (r) => r.message ?? "" },
  { header: "Read", value: (r) => (r.is_read ? "Yes" : "No") },
  { header: "IP", value: (r) => r.ip ?? "" },
];

/**
 * Admin. Streams the contact list as a CSV or PDF download.
 * Query: format=csv|pdf (+ same search/is_read filters as the list)
 */
export const exportContacts = async (req, res) => {
  try {
    const { format = "csv", search, is_read } = req.query;
    const rows = await getContactsForExport({ search, is_read });
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
      return sendPdf(res, {
        filename: `contact-messages-${stamp}.pdf`,
        title: "Contact Messages",
        subtitle: `Generated ${new Date().toISOString()}  •  ${rows.length} messages`,
        rows,
        line: (r) =>
          `#${r.id}  ${new Date(r.created_at).toLocaleString("en-IN")}  •  ` +
          `${r.name} <${r.email}>  •  ${r.mobile || "-"}\n   ${r.message}`,
        emptyText: "No contact messages yet.",
      });
    }

    return sendCsv(res, { filename: `contact-messages-${stamp}.csv`, columns: CONTACT_COLUMNS, rows });
  } catch (err) {
    console.error("exportContacts error:", err.message);
    return error(res, "Could not export contact messages", 500);
  }
};
