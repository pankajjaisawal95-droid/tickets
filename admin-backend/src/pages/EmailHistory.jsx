import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { get } from '../api/client.js';
import { dateTime } from '../lib/format.js';

export default function EmailHistory() {
  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'email_type', header: 'Type' },
    { key: 'recipient', header: 'Recipient' },
    { key: 'subject', header: 'Subject', render: (r) => <span title={r.subject}>{r.subject}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'order_id', header: 'Order', render: (r) => (r.order_id ? `#${r.order_id}` : '—') },
    { key: 'error_message', header: 'Error', render: (r) => r.error_message ? <span className="badge badge-bad" title={r.error_message}>error</span> : '—' },
    { key: 'created_at', header: 'Sent', render: (r) => dateTime(r.created_at) }
  ];
  return (
    <div>
      <div className="page-head"><h1>Email History</h1></div>
      <DataTable
        columns={columns}
        rowKey="id"
        fetcher={(p) => get('/admin/email-history', p)}
        searchPlaceholder="(use filters)"
        filters={[{ key: 'status', label: 'Status', options: [{ value: 'SENT', label: 'Sent' }, { value: 'FAILED', label: 'Failed' }, { value: 'SKIPPED', label: 'Skipped' }] }]}
      />
    </div>
  );
}
