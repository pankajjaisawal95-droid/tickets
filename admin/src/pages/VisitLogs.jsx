import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import { get, download } from '../api/client.js';
import { dateTime } from '../lib/format.js';

/** Full reverse-geocoded address, falling back to "City, Region, Country". */
const location = (r) => {
  if (r.address) return <span title={r.address}>{r.address}</span>;
  const parts = [r.city, r.region, r.country].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
};

/** "12.9716, 77.5946" — the precise browser coordinates, or a dash. */
const coords = (r) =>
  r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : '—';

export default function VisitLogs() {
  const [busy, setBusy] = useState('');

  const exportAs = async (format) => {
    setBusy(format);
    try {
      await download('/admin/visits/export', { format }, `visit-logs.${format}`);
    } catch (e) {
      alert(e.message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'created_at', header: 'Visited', render: (r) => dateTime(r.created_at) },
    { key: 'user', header: 'User', render: (r) => (r.user_id ? `#${r.user_id}` : <span className="muted">Guest</span>) },
    { key: 'location', header: 'Location', render: location },
    { key: 'coords', header: 'Coordinates', render: coords },
    { key: 'ip', header: 'IP', render: (r) => r.ip || '—' },
    { key: 'path', header: 'Page', render: (r) => r.path || '—' },
    {
      key: 'user_agent',
      header: 'Device',
      render: (r) => (r.user_agent ? <span title={r.user_agent}>{r.user_agent.slice(0, 28)}…</span> : '—'),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <h1>Visit Logs</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={!!busy} onClick={() => exportAs('csv')}>
            {busy === 'csv' ? 'Exporting…' : '⬇ Export CSV'}
          </button>
          <button className="btn" disabled={!!busy} onClick={() => exportAs('pdf')}>
            {busy === 'pdf' ? 'Exporting…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>
      <DataTable
        columns={columns}
        rowKey="id"
        fetcher={(p) => get('/admin/visits', p)}
        searchPlaceholder="Search city / IP / page…"
        emptyText="No visits recorded yet"
      />
    </div>
  );
}
