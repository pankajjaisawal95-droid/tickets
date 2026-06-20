import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { get } from '../api/client.js';
import { inr, dateTime } from '../lib/format.js';

export default function Payments() {
  const [tab, setTab] = useState('payments');
  return (
    <div>
      <div className="page-head"><h1>Payments / Reconciliation</h1></div>
      <div className="tabs">
        <button className={`tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>Payments ledger</button>
        <button className={`tab ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>Webhook events</button>
      </div>
      {tab === 'payments' ? <PaymentsTable /> : <EventsTable />}
    </div>
  );
}

function PaymentsTable() {
  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'order_id', header: 'Order', render: (r) => `#${r.order_id}` },
    { key: 'gateway', header: 'Gateway' },
    { key: 'gateway_payment_id', header: 'Payment ID', render: (r) => r.gateway_payment_id || '—' },
    { key: 'amount', header: 'Amount', className: 'num', render: (r) => inr(r.amount) },
    { key: 'amount_refunded', header: 'Refunded', className: 'num', render: (r) => inr(r.amount_refunded) },
    { key: 'method', header: 'Method', render: (r) => r.method || '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'order_status', header: 'Order', render: (r) => <StatusBadge value={r.order_status} /> },
    { key: 'captured_at', header: 'Captured', render: (r) => dateTime(r.captured_at) }
  ];
  return (
    <DataTable
      columns={columns}
      rowKey="id"
      fetcher={(p) => get('/admin/payments', p)}
      searchPlaceholder="Search order # / payment id…"
      filters={[
        { key: 'status', label: 'Status', options: ['CREATED', 'SUCCESS', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'].map((s) => ({ value: s, label: s })) }
      ]}
    />
  );
}

function EventsTable() {
  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'event_type', header: 'Event type' },
    { key: 'gateway', header: 'Gateway' },
    { key: 'gateway_order_id', header: 'Order ref', render: (r) => r.gateway_order_id || '—' },
    { key: 'gateway_payment_id', header: 'Payment ref', render: (r) => r.gateway_payment_id || '—' },
    { key: 'processed', header: 'Processed', render: (r) => <StatusBadge value={r.processed ? 'COMPLETED' : 'PENDING'} /> },
    { key: 'received_at', header: 'Received', render: (r) => dateTime(r.received_at) }
  ];
  return (
    <DataTable
      columns={columns}
      rowKey="id"
      fetcher={(p) => get('/admin/payment-events', p)}
      searchPlaceholder="Search order / payment ref…"
      filters={[{ key: 'processed', label: 'Processed', options: [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }] }]}
    />
  );
}
