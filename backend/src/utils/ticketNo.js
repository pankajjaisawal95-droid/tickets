/**
 * Human-facing ticket number derived from the ticket's numeric DB id.
 *
 * Format:  TKT + 2-digit year + 7-digit zero-padded id
 *   e.g.   id 1234 booked in 2026  ->  "TKT260001234"
 *
 * The year is taken from the ticket's creation date so the number is stable
 * for the life of the ticket (never recomputed against the current date).
 * Pass `createdAt` whenever it is available; it falls back to "now" only at
 * creation time, when that is effectively the same value.
 */
const PAD = 7;

export const formatTicketNo = (id, createdAt) => {
  if (id == null) return "";
  const d = createdAt ? new Date(createdAt) : new Date();
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `TKT${yy}${String(id).padStart(PAD, "0")}`;
};
