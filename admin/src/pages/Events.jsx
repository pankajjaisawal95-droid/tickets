import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { get, patch } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { dateTime } from '../lib/format.js';

export default function Events() {
  const navigate = useNavigate();
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  const toggleActive = async (r) => {
    try {
      await patch(`/admin/events/${r.id}/status`, { is_active: r.is_active ? 0 : 1 });
      toast.success(r.is_active ? 'Event deactivated' : 'Event activated');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const setApproval = async (r, approval_status) => {
    try {
      await patch(`/admin/events/${r.id}/status`, { approval_status });
      toast.success(`Marked ${approval_status.toLowerCase()}`);
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
    {
      key: 'approval_status', header: 'Approval', render: (r) => (
        <select
          className="input input-mini"
          value={r.approval_status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); setApproval(r, e.target.value); }}
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      )
    },
    { key: 'is_active', header: 'Status', render: (r) => <StatusBadge value={r.is_active} /> },
    {
      key: 'actions', header: '', render: (r) => (
        <span className="row" onClick={(e) => e.stopPropagation()}>
          <button className={`btn btn-sm ${r.is_active ? 'btn-danger' : ''}`} onClick={() => toggleActive(r)}>
            {r.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button className="btn btn-sm" onClick={() => navigate(`/events/${r.id}`)}>Edit</button>
        </span>
      )
    }
  ];

  return (
    <div>
      <div className="page-head">
        <h1>Events</h1>
        <button className="btn btn-primary" onClick={() => navigate('/events/new')}>+ New Event</button>
      </div>
      <DataTable
        columns={columns}
        rowKey="id"
        refreshKey={refreshKey}
        fetcher={(p) => get('/admin/events', p)}
        searchPlaceholder="Search title or venue…"
        filters={[
          { key: 'status', label: 'Active', options: [{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }] },
          { key: 'approval_status', label: 'Approval', options: [{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }] }
        ]}
        onRowClick={(r) => navigate(`/events/${r.id}`)}
      />
    </div>
  );
}
