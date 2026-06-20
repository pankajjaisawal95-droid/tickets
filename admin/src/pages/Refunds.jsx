import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { get } from '../api/client.js';
import { inr, dateTime } from '../lib/format.js';

const STATUSES = ['INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED'];

export default function Refunds() {
  const columns = [
    { key: 'id', header: 'Refund', render: (r) => <strong>#{r.id}</strong> },
    { key: 'order_id', header: 'Order', render: (r) => `#${r.order_id}` },
    { key: 'event_title', header: 'Event', render: (r) => r.event_title || '—' },
    { key: 'user_name', header: 'Customer', render: (r) => r.user_name || r.mobile || '—' },
    { key: 'refund_amount', header: 'Amount', className: 'num', render: (r) => inr(r.refund_amount) },
    { key: 'refund_type', header: 'Type' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'gateway_refund_id', header: 'Gateway ref', render: (r) => r.gateway_refund_id || '—' },
    { key: 'created_at', header: 'Requested', render: (r) => dateTime(r.created_at) }
  ];

  return (
    <div>
      <div className="page-head"><h1>Refunds</h1></div>
      <DataTable
        columns={columns}
        rowKey="id"
        fetcher={(p) => get('/admin/refunds', p)}
        searchPlaceholder="Search order # / gateway ref…"
        filters={[{ key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s })) }]}
      />
    </div>
  );
}
