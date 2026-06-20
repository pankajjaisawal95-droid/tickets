/** Formatting helpers. Money is DECIMAL rupees from the API. */

export const inr = (v) => {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(n);
};

export const num = (v) => new Intl.NumberFormat('en-IN').format(Number(v || 0));

export const dateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const dateOnly = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Convert a <input type="datetime-local"> value to MySQL DATETIME (or null). */
export const toSqlDateTime = (v) => {
  if (!v) return null;
  // "2026-04-01T07:00" -> "2026-04-01 07:00:00"
  const s = String(v).replace('T', ' ');
  return s.length === 16 ? `${s}:00` : s;
};

/** value for <input type="datetime-local"> from an ISO/SQL datetime. */
export const toLocalInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
