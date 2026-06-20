import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import { get, patch, download } from '../api/client.js';
import { dateTime } from '../lib/format.js';

export default function Contacts() {
  const [busy, setBusy] = useState('');
  const [active, setActive] = useState(null); // message currently open in the modal
  const [refreshKey, setRefreshKey] = useState(0);

  const exportAs = async (format) => {
    setBusy(format);
    try {
      await download('/admin/contacts/export', { format }, `contact-messages.${format}`);
    } catch (e) {
      alert(e.message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  // Open a message; mark it read on the server if it was unread.
  const openMessage = async (row) => {
    setActive(row);
    if (!row.is_read) {
      try {
        await patch(`/admin/contacts/${row.id}/read`, { is_read: true });
        setRefreshKey((k) => k + 1);
      } catch {
        /* non-fatal: the row simply stays marked unread */
      }
    }
  };

  const toggleRead = async (row) => {
    try {
      await patch(`/admin/contacts/${row.id}/read`, { is_read: !row.is_read });
      setActive((m) => (m && m.id === row.id ? { ...m, is_read: row.is_read ? 0 : 1 } : m));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message || 'Update failed');
    }
  };

  const columns = [
    {
      key: 'is_read',
      header: '',
      render: (r) =>
        r.is_read ? <span className="muted" title="Read">●</span> : <span title="Unread" style={{ color: '#2563eb' }}>●</span>,
    },
    { key: 'created_at', header: 'Received', render: (r) => dateTime(r.created_at) },
    {
      key: 'name',
      header: 'Name',
      render: (r) => (r.is_read ? r.name : <strong>{r.name}</strong>),
    },
    { key: 'email', header: 'Email', render: (r) => <a href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>{r.email}</a> },
    { key: 'mobile', header: 'Mobile', render: (r) => r.mobile || '—' },
    {
      key: 'message',
      header: 'Message',
      render: (r) => (
        <span title={r.message}>{r.message.length > 60 ? `${r.message.slice(0, 60)}…` : r.message}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <h1>Contact Messages</h1>
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
        fetcher={(p) => get('/admin/contacts', p)}
        filters={[
          {
            key: 'is_read',
            label: 'All messages',
            options: [
              { value: '0', label: 'Unread' },
              { value: '1', label: 'Read' },
            ],
          },
        ]}
        searchPlaceholder="Search name / email / mobile / message…"
        emptyText="No contact messages yet"
        onRowClick={openMessage}
        refreshKey={refreshKey}
      />

      {active && (
        <Modal
          title="Contact Message"
          onClose={() => setActive(null)}
          footer={
            <>
              <button className="btn" onClick={() => toggleRead(active)}>
                Mark as {active.is_read ? 'unread' : 'read'}
              </button>
              <a className="btn btn-primary" href={`mailto:${active.email}?subject=Re: Your message`}>
                Reply by email
              </a>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><span className="muted">Name</span><div>{active.name}</div></div>
            <div><span className="muted">Email</span><div><a href={`mailto:${active.email}`}>{active.email}</a></div></div>
            <div><span className="muted">Mobile</span><div>{active.mobile || '—'}</div></div>
            <div><span className="muted">Received</span><div>{dateTime(active.created_at)}</div></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <span className="muted">Message</span>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{active.message}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
