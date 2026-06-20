import { get } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { inr, num, dateOnly } from '../lib/format.js';

export default function Dashboard() {
  const { data, loading, error } = useFetch(() => get('/admin/dashboard'));

  if (loading) return <div className="empty">Loading dashboard…</div>;
  if (error) return <div className={`notice ${error.toLowerCase().includes('authoriz') ? 'notice-bad' : ''}`}>{error}</div>;

  const { counts, revenue, refunds, today, trend, topEvents } = data;
  const maxRev = Math.max(1, ...trend.map((t) => Number(t.revenue)));

  return (
    <div>
      <div className="page-head"><h1>Dashboard</h1></div>

      <div className="cards">
        <Stat label="Gross Revenue" value={inr(revenue.gross)} sub={`Net ${inr(revenue.net)}`} />
        <Stat label="Tickets Sold" value={num(revenue.tickets_sold)} sub={`${num(counts.active_tickets)} active`} />
        <Stat label="Paid Orders" value={num(counts.paid_orders)} sub={`${num(counts.total_orders)} total`} />
        <Stat label="Refunds" value={inr(refunds.total)} sub={`${num(refunds.count)} processed`} />
        <Stat label="Today" value={inr(today.revenue)} sub={`${num(today.orders)} orders`} />
        <Stat label="Events" value={num(counts.total_events)} sub={`${num(counts.active_events)} active · ${num(counts.pending_events)} pending`} />
        <Stat label="Users" value={num(counts.total_users)} />
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 22 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Revenue — last 7 days</div>
        {trend.length === 0 ? (
          <div className="empty">No paid orders in the last 7 days</div>
        ) : (
          <div className="chart-bars">
            {trend.map((t) => (
              <div className="bar-col" key={t.day}>
                <div className="subtle">{inr(t.revenue)}</div>
                <div className="bar" style={{ height: `${(Number(t.revenue) / maxRev) * 100}%` }} title={`${t.orders} orders`} />
                <div className="bar-label">{dateOnly(t.day)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Top events by revenue</div>
        <table className="mini-table">
          <thead>
            <tr><th>Event</th><th className="num">Orders</th><th className="num">Tickets</th><th className="num">Revenue</th></tr>
          </thead>
          <tbody>
            {topEvents.length === 0 && <tr><td colSpan={4} className="muted">No data</td></tr>}
            {topEvents.map((e) => (
              <tr key={e.event_id}>
                <td>{e.title || `#${e.event_id}`}</td>
                <td className="num">{num(e.orders)}</td>
                <td className="num">{num(e.tickets)}</td>
                <td className="num">{inr(e.revenue)}</td>
              </tr>
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
