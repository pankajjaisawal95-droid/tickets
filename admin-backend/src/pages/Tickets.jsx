import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { get, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { num, dateTime } from '../lib/format.js';

const STATUSES = ['BOOKED', 'USED', 'CANCELLED'];

export default function Tickets() {
  const [tab, setTab] = useState('tickets');
  const [busy, setBusy] = useState('');

  const exportAs = async (format) => {
    setBusy(format);
    try {
      await download('/admin/tickets/export', { format }, `tickets.${format}`);
    } catch (e) {
      alert(e.message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Tickets & Scans</h1>
        {tab === 'tickets' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={!!busy} onClick={() => exportAs('csv')}>
              {busy === 'csv' ? 'Exporting…' : '⬇ Export CSV'}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => exportAs('pdf')}>
              {busy === 'pdf' ? 'Exporting…' : '⬇ Download PDF'}
            </button>
          </div>
        )}
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'tickets' ? 'active' : ''}`} onClick={() => setTab('tickets')}>Tickets</button>
        <button className={`tab ${tab === 'scans' ? 'active' : ''}`} onClick={() => setTab('scans')}>Scan analytics</button>
      </div>
      {tab === 'tickets' ? <TicketsTable /> : <ScanAnalytics />}
    </div>
  );
}

function TicketsTable() {
  // Events for the event-wise filter dropdown.
  const { data: events } = useFetch(() => get('/admin/events', { limit: 200 }));
  const eventOptions = (events?.rows || []).map((e) => ({ value: String(e.id), label: e.title || `#${e.id}` }));

  const columns = [
    { key: 'sno', header: 'S.No', className: 'num', render: (_r, i) => i + 1 },
    // User details
    {
      key: 'user_name',
      header: 'Customer',
      render: (r) => r.user_name || '—',
    },
    { key: 'mobile', header: 'Mobile', render: (r) => r.mobile || '—' },
    { key: 'email', header: 'Email', render: (r) => r.email || '—' },
    // Event details
    { key: 'event_title', header: 'Event', render: (r) => r.event_title || `#${r.event_id}` },
    { key: 'event_start', header: 'Event date', render: (r) => (r.event_start ? dateTime(r.event_start) : '—') },
    { key: 'presented_by', header: 'Presented by', render: (r) => r.presented_by || '—' },
    // { key: 'ticket_type_name', header: 'Type', render: (r) => r.ticket_type_name || '—' },
    { key: 'available_ticket', header: 'Avail', className: 'num' },
    { key: 'used_ticket', header: 'Used', className: 'num' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'created_at', header: 'Issued', render: (r) => dateTime(r.created_at) }
  ];
  return (
    <DataTable
      columns={columns}
      rowKey="id"
      fetcher={(p) => get('/admin/tickets', p)}
      searchPlaceholder="Search ticket # / qr / mobile / name / email…"
      filters={[
        { key: 'event_id', label: 'All events', options: eventOptions },
        { key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s })) }
      ]}
    />
  );
}

function ScanAnalytics() {
  const { data: events } = useFetch(() => get('/admin/events', { limit: 100 }));
  const [eventId, setEventId] = useState('');

  return (
    <div>
      <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
        <label className="field" style={{ maxWidth: 360, marginBottom: 0 }}>
          <span>Select event</span>
          <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">— Choose an event —</option>
            {(events?.rows || []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </label>
      </div>
      {eventId ? <EventScans key={eventId} eventId={eventId} /> : <div className="empty">Pick an event to see scan analytics</div>}
    </div>
  );
}

function EventScans({ eventId }) {
  const { data, loading, error } = useFetch(() => get(`/admin/events/${eventId}/scan-analytics`), [eventId]);

  const scanColumns = [
    { key: 'ticket_id', header: 'Ticket', render: (s) => `#${s.ticket_id}` },
    { key: 'ticket_type_name', header: 'Type', render: (s) => s.ticket_type_name || '—' },
    { key: 'booked', header: 'Booked', className: 'num', render: (s) => num(Number(s.available || 0) + Number(s.used || 0)) },
    { key: 'available', header: 'Available', className: 'num', render: (s) => num(s.available) },
    { key: 'used', header: 'Used (scanned)', className: 'num', render: (s) => num(s.used) },
    { key: 'scanned_by', header: 'Scanned by', render: (s) => s.scanned_by_name || s.scanned_by || '—' },
    { key: 'scanned_at', header: 'When', render: (s) => dateTime(s.scanned_at) },
    { key: 'device_info', header: 'Device', render: (s) => s.device_info || '—' }
  ];

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="notice notice-bad">{error}</div>;

  return (
    <>
      <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Used vs available per ticket type · {num(data.totalScans)} total scans</div>
        <table className="mini-table">
          <thead><tr><th>Ticket type</th><th className="num">Total qty</th><th className="num">Booked</th><th className="num">Available</th><th className="num">Used (scanned)</th></tr></thead>
          <tbody>
            {data.byType.length === 0 && <tr><td colSpan={5} className="muted">No ticket types</td></tr>}
            {data.byType.map((t) => (
              <tr key={t.ticket_type_id}>
                <td>{t.ticket_type_name}</td>
                <td className="num">{num(t.total_quantity)}</td>
                <td className="num">{num(t.booked)}</td>
                <td className="num">{num(t.available)}</td>
                <td className="num">{num(t.used)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Recent scans</div>
        <DataTable
          columns={scanColumns}
          rowKey="id"
          fetcher={(p) => get(`/admin/events/${eventId}/scans`, p)}
          searchPlaceholder="Search scans…"
          emptyText="No scans yet"
        />
      </div>
    </>
  );
}
