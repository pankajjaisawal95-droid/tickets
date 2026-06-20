import { useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable.jsx';
import { get } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { inr, num, dateTime } from '../lib/format.js';

/**
 * Read-only per-event dashboard for the organiser: sales + revenue and
 * scan/attendance, plus a scan log and attendee list. All endpoints are
 * ownership-guarded server-side.
 */
export default function EventAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => get(`/organiser/events/${id}/analytics`), [id]);
  const { data: ev } = useFetch(() => get(`/organiser/events/${id}`), [id]);
  const { data: att } = useFetch(() => get(`/organiser/events/${id}/attendees`), [id]);

  if (loading && !data) return <div className="empty">Loading analytics…</div>;
  if (error && !data) return <div className="notice notice-bad">{error}</div>;

  const s = data?.summary || {};
  const byType = data?.byType || [];

  return (
    <div>
      <div className="page-head">
        <h1>{ev?.event?.title ? `${ev.event.title} — Analytics` : `Event #${id} — Analytics`}</h1>
        <div className="row">
          <button className="btn" onClick={() => navigate('/events')}>← Events</button>
          <button className="btn" onClick={() => navigate(`/events/${id}`)}>Edit event</button>
        </div>
      </div>

      <div className="cards">
        <Stat label="Gross Revenue" value={inr(s.gross_revenue)} sub={`${num(s.paid_orders)} paid orders`} />
        <Stat label="Tickets Sold" value={num(s.tickets_sold)} />
        <Stat label="Attendees" value={num(s.total_attendees)} />
        <Stat label="Total Check-ins" value={num(s.total_scans)} />
      </div>

      <div className="panel" style={{ padding: 18, marginTop: 22 }}>
        <div className="section-title" style={{ marginTop: 0 }}>By ticket type</div>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Type</th><th className="num">Price</th><th className="num">Sold</th>
              <th className="num">Revenue</th><th className="num">Booked</th>
              <th className="num">Checked-in</th><th className="num">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {byType.length === 0 && <tr><td colSpan={7} className="muted">No ticket types yet</td></tr>}
            {byType.map((t) => (
              <tr key={t.ticket_type_id}>
                <td>{t.name}</td>
                <td className="num">{inr(t.price)}</td>
                <td className="num">{num(t.sold)}</td>
                <td className="num">{inr(t.revenue)}</td>
                <td className="num">{num(t.booked)}</td>
                <td className="num">{num(t.checked_in)}</td>
                <td className="num">{num(t.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: 18, marginTop: 22 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Scan log</div>
        <DataTable
          rowKey="id"
          fetcher={(p) => get(`/organiser/events/${id}/scans`, p)}
          emptyText="No scans yet"
          columns={[
            { key: 'scanned_at', header: 'When', render: (r) => dateTime(r.scanned_at) },
            { key: 'ticket_type_name', header: 'Ticket type', render: (r) => r.ticket_type_name || '—' },
            { key: 'ticket_id', header: 'Ticket', className: 'num' },
            { key: 'scanned_by_name', header: 'Scanned by', render: (r) => r.scanned_by_name || r.scanned_by || '—' }
          ]}
        />
      </div>

      <div className="panel" style={{ padding: 18, marginTop: 22 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Attendees {att ? `(${att.count})` : ''}</div>
        <table className="mini-table">
          <thead><tr><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            {(!att || att.count === 0) && <tr><td colSpan={2} className="muted">No attendees yet</td></tr>}
            {(att?.attendees || []).map((a, i) => (
              <tr key={i}><td>{a.name || '—'}</td><td>{a.email || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="panel stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
