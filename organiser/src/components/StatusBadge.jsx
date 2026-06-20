/** Colour-coded status pill. Maps known statuses to a tone class. */
const TONE = {
  // orders / payments
  PAID: 'ok', SUCCESS: 'ok', COMPLETED: 'ok', APPROVED: 'ok', ACTIVE: 'ok', BOOKED: 'ok',
  HOLD: 'warn', PENDING: 'warn', INITIATED: 'warn', PROCESSING: 'warn', CREATED: 'warn',
  CANCELLED: 'bad', EXPIRED: 'bad', FAILED: 'bad', REJECTED: 'bad', REFUNDED: 'bad',
  DEACTIVE: 'bad', BLOCKED: 'bad', DELETED: 'bad', USED: 'muted'
};

export default function StatusBadge({ value, map }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;

  // Numeric/boolean active flags
  if (map) {
    const m = map[value] || map[String(value)];
    if (m) return <span className={`badge badge-${m.tone}`}>{m.label}</span>;
  }
  if (value === 1 || value === '1') return <span className="badge badge-ok">Active</span>;
  if (value === 0 || value === '0') return <span className="badge badge-muted">Inactive</span>;

  const key = String(value).toUpperCase();
  const tone = TONE[key] || 'muted';
  return <span className={`badge badge-${tone}`}>{value}</span>;
}
