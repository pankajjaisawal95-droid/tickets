import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { get, post } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/Toast.jsx';
import { dateTime } from '../lib/format.js';

/**
 * The organiser's own events. Approval + active state are admin-owned and shown
 * read-only here; the organiser's lever is "Submit for review", which is gated
 * on their KYC approval (resolved from /organiser/me).
 */
export default function Events() {
  const navigate = useNavigate();
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: me } = useFetch(() => get('/organiser/me'));
  const approved = me?.kyc_status === 'APPROVED';

  const submitForReview = async (r) => {
    try {
      await post(`/organiser/events/${r.id}/submit`, {});
      toast.success('Submitted for review');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'title', header: 'Title', render: (r) => <strong>{r.title}</strong> },
    { key: 'venue', header: 'Venue', render: (r) => r.venue || '—' },
    { key: 'category_name', header: 'Category', render: (r) => r.category_name || '—' },
    { key: 'start_datetime', header: 'Starts', render: (r) => dateTime(r.start_datetime) },
    { key: 'ticket_type_count', header: 'Types', className: 'num' },
    { key: 'approval_status', header: 'Approval', render: (r) => <StatusBadge value={r.approval_status} /> },
    { key: 'is_active', header: 'Live', render: (r) => <StatusBadge value={r.is_active} map={{ 1: { tone: 'ok', label: 'Live' }, 0: { tone: 'muted', label: 'Draft' } }} /> },
    {
      key: 'actions', header: '', render: (r) => (
        <span className="row" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-sm btn-primary"
            disabled={!approved}
            title={approved ? 'Submit this event for admin review' : 'Awaiting admin approval of your account'}
            onClick={() => submitForReview(r)}
          >
            Submit
          </button>
          <button className="btn btn-sm" onClick={() => navigate(`/events/${r.id}`)}>Edit</button>
          <button className="btn btn-sm" onClick={() => navigate(`/events/${r.id}/analytics`)}>Stats</button>
        </span>
      )
    }
  ];

  return (
    <div>
      <div className="page-head">
        <h1>My Events</h1>
        <button className="btn btn-primary" onClick={() => navigate('/events/new')}>+ New Event</button>
      </div>
      {me && !approved && (
        <div className="notice notice-bad" style={{ marginBottom: 14 }}>
          Your account is awaiting admin approval — you can edit drafts but can&apos;t submit events for review yet.
        </div>
      )}
      <DataTable
        columns={columns}
        rowKey="id"
        refreshKey={refreshKey}
        fetcher={(p) => get('/organiser/events', p)}
        searchPlaceholder="Search title or venue…"
        filters={[
          { key: 'approval_status', label: 'Approval', options: [{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }] }
        ]}
        onRowClick={(r) => navigate(`/events/${r.id}`)}
      />
    </div>
  );
}
