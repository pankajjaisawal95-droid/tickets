import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import { get, patch } from '../api/client.js';
import { dateTime } from '../lib/format.js';

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const STATUS_COLOR = { pending: '#d97706', approved: '#16a34a', rejected: '#dc2626' };

function Stars({ value }) {
  const n = Math.max(0, Math.min(5, Number(value) || 0));
  return <span style={{ color: '#f0a500', letterSpacing: 1 }}>{'★'.repeat(n)}<span style={{ color: '#d1d5db' }}>{'★'.repeat(5 - n)}</span></span>;
}

export default function Reviews() {
  const [active, setActive] = useState(null); // review open in the modal
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Approve / reject / re-queue a review.
  const setStatus = async (row, status) => {
    setBusy(true);
    try {
      await patch(`/admin/reviews/${row.id}/status`, { status });
      setActive((m) => (m && m.id === row.id ? { ...m, status } : m));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>
          {STATUS_LABEL[r.status] || r.status}
        </span>
      ),
    },
    { key: 'created_at', header: 'Submitted', render: (r) => dateTime(r.created_at) },
    { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
    { key: 'role', header: 'Role', render: (r) => r.role || '—' },
    { key: 'rating', header: 'Rating', render: (r) => <Stars value={r.rating} /> },
    {
      key: 'comment',
      header: 'Comment',
      render: (r) => (
        <span title={r.comment}>{r.comment.length > 70 ? `${r.comment.slice(0, 70)}…` : r.comment}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <h1>Reviews</h1>
      </div>

      <DataTable
        columns={columns}
        rowKey="id"
        fetcher={(p) => get('/admin/reviews', p)}
        filters={[
          {
            key: 'status',
            label: 'All statuses',
            options: [
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ],
          },
        ]}
        searchPlaceholder="Search name / role / comment…"
        emptyText="No reviews yet"
        onRowClick={setActive}
        refreshKey={refreshKey}
      />

      {active && (
        <Modal
          title="Review"
          onClose={() => setActive(null)}
          footer={
            <>
              {active.status !== 'approved' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => setStatus(active, 'approved')}>
                  ✓ Approve
                </button>
              )}
              {active.status !== 'rejected' && (
                <button className="btn" disabled={busy} onClick={() => setStatus(active, 'rejected')}>
                  ✕ Reject
                </button>
              )}
              {active.status !== 'pending' && (
                <button className="btn" disabled={busy} onClick={() => setStatus(active, 'pending')}>
                  ↺ Move to pending
                </button>
              )}
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><span className="muted">Name</span><div>{active.name}</div></div>
            <div><span className="muted">Role</span><div>{active.role || '—'}</div></div>
            <div><span className="muted">Rating</span><div><Stars value={active.rating} /> ({active.rating}/5)</div></div>
            <div><span className="muted">Status</span><div style={{ color: STATUS_COLOR[active.status], fontWeight: 600 }}>{STATUS_LABEL[active.status] || active.status}</div></div>
            <div><span className="muted">Submitted</span><div>{dateTime(active.created_at)}</div></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <span className="muted">Comment</span>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{active.comment}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
