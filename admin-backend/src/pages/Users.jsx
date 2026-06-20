import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import { get, post, patch } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { num, dateTime } from '../lib/format.js';

export default function Users() {
  const [tab, setTab] = useState('users');
  return (
    <div>
      <div className="page-head"><h1>Users & Validators</h1></div>
      <div className="tabs">
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Users</button>
        <button className={`tab ${tab === 'validators' ? 'active' : ''}`} onClick={() => setTab('validators')}>Validators</button>
      </div>
      {tab === 'users' ? <UsersTable /> : <ValidatorsTable />}
    </div>
  );
}

function UsersTable() {
  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name', render: (r) => r.name || '—' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'email', header: 'Email', render: (r) => r.email || '—' },
    { key: 'role_id', header: 'Role', render: (r) => (Number(r.role_id) === 2 ? <span className="badge badge-ok">Admin</span> : <span className="badge badge-muted">User</span>) },
    { key: 'paid_orders', header: 'Paid orders', className: 'num', render: (r) => num(r.paid_orders) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'created_at', header: 'Joined', render: (r) => dateTime(r.created_at) }
  ];
  return (
    <DataTable
      columns={columns}
      rowKey="id"
      fetcher={(p) => get('/admin/users', p)}
      searchPlaceholder="Search name / mobile / email…"
      filters={[{ key: 'status', label: 'Status', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'BLOCKED', label: 'Blocked' }, { value: 'DELETED', label: 'Deleted' }] }]}
    />
  );
}

function ValidatorsTable() {
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const refresh = () => setRefreshKey((k) => k + 1);

  const setStatus = async (r, status) => {
    try { await patch(`/admin/validators/${r.id}/status`, { status }); toast.success('Updated'); refresh(); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'event_title', header: 'Event', render: (r) => r.event_title || `#${r.event_id}` },
    { key: 'is_verified', header: 'Verified', render: (r) => <StatusBadge value={r.is_verified ? 'APPROVED' : 'PENDING'} /> },
    { key: 'device_name', header: 'Device', render: (r) => r.device_name || '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', render: (r) => (
        r.status === 'ACTIVE'
          ? <button className="btn btn-sm btn-danger" onClick={() => setStatus(r, 'DEACTIVE')}>Deactivate</button>
          : <button className="btn btn-sm" onClick={() => setStatus(r, 'ACTIVE')}>Activate</button>
      )
    }
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add Validator</button>
      </div>
      <DataTable
        columns={columns}
        rowKey="id"
        refreshKey={refreshKey}
        fetcher={(p) => get('/admin/validators', p)}
        searchPlaceholder="Search name / mobile…"
        filters={[{ key: 'status', label: 'Status', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'DEACTIVE', label: 'Deactive' }] }]}
      />
      {adding && <ValidatorModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}

function ValidatorModal({ onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', mobile: '', email: '', event_id: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    if (!v.name || !v.mobile || !v.event_id) return toast.error('Name, mobile and event ID are required');
    setBusy(true);
    try { await post('/admin/validators', v); toast.success('Validator added'); onSaved(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add validator" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <label className="field"><span>Name *</span><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label className="field"><span>Mobile *</span><input className="input" value={v.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} maxLength={10} /></label>
      <label className="field"><span>Email</span><input className="input" value={v.email} onChange={(e) => set('email', e.target.value)} /></label>
      <label className="field"><span>Event ID *</span><input className="input" type="number" value={v.event_id} onChange={(e) => set('event_id', e.target.value)} /></label>
    </Modal>
  );
}
