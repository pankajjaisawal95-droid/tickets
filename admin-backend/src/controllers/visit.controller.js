import { success, error } from "../helpers/response.helper.js";
import { sendCsv, sendPdf } from "../helpers/export.helper.js";
import {
  logVisit,
  getVisitStats,
  listVisits as listVisitsService,
  getVisitsForExport,
} from "../services/visit.service.js";

/**
 * Public. Records the visitor's real location for the page they just opened.
 * The frontend resolves precise coordinates from the browser (navigator
 * geolocation), reverse-geocodes them to an address, and sends
 * { path, latitude, longitude, address, city, region, country } in the body.
 * The IP is still kept (from the geoLocation middleware) for reference.
 * No auth required, but if a valid token is present req.userId is attached.
 */
export const trackVisit = async (req, res) => {
  const b = req.body || {};
  const latitude = Number(b.latitude);
  const longitude = Number(b.longitude);

  const location = {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    address: b.address || null,
    city: b.city || null,
    region: b.region || null,
    country: b.country || null,
  };

  const id = await logVisit({
    geo: req.geo,
    location,
    path: b.path || req.headers["referer"] || null,
    userAgent: req.headers["user-agent"] || null,
    userId: req.userId || null,
  });

  // Return the stored location so the frontend can use it too if needed.
  return success(res, { id, location }, "Visit recorded");
};

/**
 * Admin. Aggregated visitor-location stats (counts by country and city).
 */
export const visitStats = async (req, res) => {
  try {
    const stats = await getVisitStats();
    return success(res, stats, "Visit stats");
  } catch (err) {
    console.error("visitStats error:", err.message);
    return error(res, "Could not load visit stats", 500);
  }
};

/**
 * Admin. Paginated list of visits for the admin table.
 * Query: limit, offset, country, search
 */
export const listVisits = async (req, res) => {
  try {
    const { limit, offset, country, search } = req.query;
    const result = await listVisitsService({ limit, offset, country, search });
    return success(res, result, "Visits fetched");
  } catch (err) {
    console.error("listVisits error:", err.message);
    return error(res, "Could not load visits", 500);
  }
};

/** CSV column map for the visit export. */
const VISIT_COLUMNS = [
  { header: "ID", value: (r) => r.id },
  { header: "Visited At", value: (r) => new Date(r.created_at).toISOString() },
  { header: "User ID", value: (r) => r.user_id ?? "" },
  { header: "IP", value: (r) => r.ip ?? "" },
  { header: "Country", value: (r) => r.country ?? "" },
  { header: "Region", value: (r) => r.region ?? "" },
  { header: "City", value: (r) => r.city ?? "" },
  { header: "Latitude", value: (r) => r.latitude ?? "" },
  { header: "Longitude", value: (r) => r.longitude ?? "" },
  { header: "Address", value: (r) => r.address ?? "" },
  { header: "Path", value: (r) => r.path ?? "" },
  { header: "User Agent", value: (r) => r.user_agent ?? "" },
];

/**
 * Admin. Streams the visit list as a CSV or PDF download.
 * Query: format=csv|pdf  (+ same country/search filters as the list)
 */
export const exportVisits = async (req, res) => {
  try {
    const { format = "csv", country, search } = req.query;
    const rows = await getVisitsForExport({ country, search });
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
      return sendPdf(res, {
        filename: `visit-logs-${stamp}.pdf`,
        title: "Visitor Location Report",
        subtitle: `Generated ${new Date().toISOString()}  •  ${rows.length} visits`,
        rows,
        line: (r) =>
          `#${r.id}  ${new Date(r.created_at).toLocaleString("en-IN")}  •  ` +
          `${r.address || [r.city, r.region, r.country].filter(Boolean).join(", ") || "Unknown"}  •  ` +
          `${r.latitude != null && r.longitude != null ? `(${r.latitude}, ${r.longitude})  •  ` : ""}` +
          `IP ${r.ip || "-"}  •  User ${r.user_id ?? "guest"}  •  ${r.path || "-"}`,
        emptyText: "No visits recorded yet.",
      });
    }

    return sendCsv(res, { filename: `visit-logs-${stamp}.csv`, columns: VISIT_COLUMNS, rows });
  } catch (err) {
    console.error("exportVisits error:", err.message);
    return error(res, "Could not export visits", 500);
  }
};
