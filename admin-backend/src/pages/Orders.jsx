import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { get, post } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { inr, dateTime } from '../lib/format.js';

const STATUSES = ['HOLD', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

export default function Orders() {
  const [detail, setDetail] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const columns = [
    { key: 'id', header: 'Order', render: (r) => <strong>#{r.id}</strong> },
    { key: 'user_name', header: 'Customer', render: (r) => r.user_name || r.mobile || '—' },
    { key: 'event_title', header: 'Event', render: (r) => r.event_title || `#${r.event_id}` },
    { key: 'total_price', header: 'Total', className: 'num', render: (r) => inr(r.total_price) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'payment_status', header: 'Payment', render: (r) => <StatusBadge value={r.payment_status} /> },
    { key: 'created_at', header: 'Placed', render: (r) => dateTime(r.created_at) }
  ];

  return (
    <div>
      <div className="page-head"><h1>Orders</h1></div>
      <DataTable
        columns={columns}
        rowKey="id"
        refreshKey={refreshKey}
        fetcher={(p) => get('/admin/orders', p)}
        searchPlaceholder="Search order # / mobile / name…"
        filters={[{ key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s })) }]}
        onRowClick={(r) => setDetail(r.id)}
      />
      {detail && (
        <OrderDrawer
          orderId={detail}
          onClose={() => setDetail(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function OrderDrawer({ orderId, onClose, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    get(`/admin/orders/${orderId}`).then(setData).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const doRefund = async () => {
    setBusy(true);
    try {
      await post(`/admin/orders/${orderId}/refund`, { reason: 'Admin-initiated refund' });
      toast.success('Refund initiated');
      setConfirmRefund(false);
      load();
      onChanged?.();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const o = data?.order;
  const canRefund = o?.status === 'PAID';

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>Order #{orderId}</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          {loading && <div className="empty">Loading…</div>}
          {!loading && data && (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div><StatusBadge value={o.status} /> <StatusBadge value={o.payment_status} /></div>
                {canRefund && <button className="btn btn-danger btn-sm" onClick={() => setConfirmRefund(true)}>Refund order</button>}
              </div>

              <div className="section-title">Customer</div>
              <dl className="kv">
                <dt>Name</dt><dd>{data.contact?.name || o.user_name || '—'}</dd>
                <dt>Mobile</dt><dd>{o.mobile || '—'}</dd>
                <dt>Email</dt><dd>{data.contact?.email || o.user_email || '—'}</dd>
                <dt>WhatsApp</dt><dd>{data.contact?.whatsapp_no || '—'}</dd>
                <dt>Event</dt><dd>{o.event_title} {o.start_datetime ? `· ${dateTime(o.start_datetime)}` : ''}</dd>
              </dl>

              <div className="section-title">Items</div>
              <table className="mini-table">
                <thead><tr><th>Ticket type</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">GST</th><th className="num">Line total</th></tr></thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.ticket_type_name || `#${it.ticket_type_id}`}</td>
                      <td className="num">{it.quantity}</td>
                      <td className="num">{inr(it.unit_price || it.price)}</td>
                      <td className="num">{inr(it.gst_amount)}</td>
                      <td className="num">{inr(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="section-title">Breakdown</div>
              <dl className="kv">
                <dt>Subtotal</dt><dd>{inr(o.subtotal)}</dd>
                <dt>Discount {o.discount_code ? `(${o.discount_code})` : ''}</dt><dd>− {inr(o.discount_amount)}</dd>
                <dt>Convenience fee</dt><dd>{inr(o.convenience_fee)}</dd>
                <dt>Tax ({o.tax_percent || 0}%)</dt><dd>{inr(o.tax_amount)}</dd>
                <dt><strong>Total</strong></dt><dd><strong>{inr(o.total_price)}</strong></dd>
              </dl>

              <div className="section-title">Payment</div>
              {data.payments.length === 0 ? <div className="muted">No payment records</div> : data.payments.map((p) => (
                <dl className="kv" key={p.id}>
                  <dt>Gateway</dt><dd>{p.gateway} · <StatusBadge value={p.status} /></dd>
                  <dt>Payment ID</dt><dd>{p.gateway_payment_id || '—'}</dd>
                  <dt>Amount</dt><dd>{inr(p.amount)} {Number(p.amount_refunded) > 0 ? `(refunded ${inr(p.amount_refunded)})` : ''}</dd>
                  <dt>Method</dt><dd>{p.method || '—'}</dd>
                  <dt>Captured</dt><dd>{dateTime(p.captured_at)}</dd>
                </dl>
              ))}

              {data.refunds.length > 0 && (
                <>
                  <div className="section-title">Refunds</div>
                  <table className="mini-table">
                    <thead><tr><th>ID</th><th className="num">Amount</th><th>Type</th><th>Status</th><th>When</th></tr></thead>
                    <tbody>
                      {data.refunds.map((r) => (
                        <tr key={r.id}><td>#{r.id}</td><td className="num">{inr(r.refund_amount)}</td><td>{r.refund_type}</td><td><StatusBadge value={r.status} /></td><td>{dateTime(r.created_at)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {data.tickets.length > 0 && (
                <>
                  <div className="section-title">Tickets</div>
                  <table className="mini-table">
                    <thead><tr><th>ID</th><th>Status</th><th className="num">Avail</th><th className="num">Used</th></tr></thead>
                    <tbody>
                      {data.tickets.map((t) => (
                        <tr key={t.id}><td>#{t.id}</td><td><StatusBadge value={t.status} /></td><td className="num">{t.available_ticket}</td><td className="num">{t.used_ticket}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {data.statusHistory.length > 0 && (
                <>
                  <div className="section-title">Status history</div>
                  <table className="mini-table">
                    <thead><tr><th>From</th><th>To</th><th>Note</th><th>When</th></tr></thead>
                    <tbody>
                      {data.statusHistory.map((h) => (
                        <tr key={h.id}><td>{h.from_status || '—'}</td><td>{h.to_status}</td><td>{h.note || '—'}</td><td>{dateTime(h.created_at)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {confirmRefund && (
        <ConfirmModal
          title="Refund order"
          message={`Initiate a full refund for order #${orderId}? This calls the payment gateway and cannot be undone.`}
          confirmLabel="Refund now"
          busy={busy}
          onConfirm={doRefund}
          onClose={() => setConfirmRefund(false)}
        />
      )}
    </div>
  );
}
