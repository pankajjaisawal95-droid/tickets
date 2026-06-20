import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import { get, post, put, del } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { inr, dateOnly, toLocalInput, toSqlDateTime } from '../lib/format.js';

const BLANK = {
  code: '', type: 'PERCENT', value: '', max_discount: '', event_id: '', ticket_type_id: '',
  min_qty: 1, min_amount: 0, usage_limit: '', per_user_limit: 1, valid_from: '', valid_to: '', status: 1
};

export default function Coupons() {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [redemptions, setRedemptions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const columns = [
    { key: 'code', header: 'Code', render: (r) => <strong>{r.code}</strong> },
    { key: 'type', header: 'Type' },
    { key: 'value', header: 'Value', render: (r) => (r.type === 'PERCENT' ? `${r.value}%` : inr(r.value)) },
    { key: 'max_discount', header: 'Max', render: (r) => (r.max_discount ? inr(r.max_discount) : '—') },
    { key: 'event_title', header: 'Event', render: (r) => r.event_title || 'All' },
    { key: 'valid_to', header: 'Valid to', render: (r) => dateOnly(r.valid_to) },
    { key: 'redemption_count', header: 'Used', className: 'num' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', render: (r) => (
        <span className="row" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => loadRedemptions(r)}>Uses</button>
          <button className="btn btn-sm" onClick={() => openEdit(r)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirm(r)}>Del</button>
        </span>
      )
    }
  ];

  const openEdit = async (r) => {
    try {
      const full = await get(`/admin/coupons/${r.id}`);
      setEditing({
        id: full.id, code: full.code, type: full.type, value: full.value ?? '',
        max_discount: full.max_discount ?? '', event_id: full.event_id ?? '', ticket_type_id: full.ticket_type_id ?? '',
        min_qty: full.min_qty ?? 1, min_amount: full.min_amount ?? 0, usage_limit: full.usage_limit ?? '',
        per_user_limit: full.per_user_limit ?? 1, valid_from: toLocalInput(full.valid_from), valid_to: toLocalInput(full.valid_to),
        status: full.status ?? 1
      });
    } catch (err) { toast.error(err.message); }
  };

  const loadRedemptions = async (r) => {
    try { const data = await get(`/admin/coupons/${r.id}/redemptions`); setRedemptions({ coupon: r, ...data }); }
    catch (err) { toast.error(err.message); }
  };

  const save = async (vals) => {
    setBusy(true);
    const payload = {
      ...vals,
      max_discount: vals.max_discount === '' ? null : vals.max_discount,
      event_id: vals.event_id === '' ? null : vals.event_id,
      ticket_type_id: vals.ticket_type_id === '' ? null : vals.ticket_type_id,
      usage_limit: vals.usage_limit === '' ? null : vals.usage_limit,
      valid_from: toSqlDateTime(vals.valid_from), valid_to: toSqlDateTime(vals.valid_to)
    };
    try {
      if (vals.id) await put(`/admin/coupons/${vals.id}`, payload);
      else await post('/admin/coupons', payload);
      toast.success('Saved');
      setEditing(null);
      refresh();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await del(`/admin/coupons/${confirm.id}`); toast.success('Removed'); setConfirm(null); refresh(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Coupons</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK })}>+ New Coupon</button>
      </div>
      <DataTable
        columns={columns}
        rowKey="id"
        refreshKey={refreshKey}
        fetcher={(p) => get('/admin/coupons', p)}
        searchPlaceholder="Search code…"
        filters={[
          { key: 'type', label: 'Type', options: [{ value: 'PERCENT', label: 'Percent' }, { value: 'FLAT', label: 'Flat' }] },
          { key: 'status', label: 'Status', options: [{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }] }
        ]}
      />

      {editing && <CouponModal initial={editing} busy={busy} onSave={save} onClose={() => setEditing(null)} />}
      {confirm && <ConfirmModal title="Remove coupon" message={`Disable coupon "${confirm.code}"?`} confirmLabel="Remove" busy={busy} onConfirm={remove} onClose={() => setConfirm(null)} />}
      {redemptions && (
        <Modal title={`Redemptions — ${redemptions.coupon.code}`} wide onClose={() => setRedemptions(null)}>
          <table className="mini-table">
            <thead><tr><th>User</th><th>Mobile</th><th>Order</th><th className="num">Amount</th><th>When</th></tr></thead>
            <tbody>
              {redemptions.rows.length === 0 && <tr><td colSpan={5} className="muted">No redemptions</td></tr>}
              {redemptions.rows.map((x) => (
                <tr key={x.id}><td>{x.user_name || '—'}</td><td>{x.mobile || '—'}</td><td>#{x.order_id}</td><td className="num">{inr(x.amount)}</td><td>{dateOnly(x.created_at)}</td></tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

function CouponModal({ initial, onSave, onClose, busy }) {
  const [v, setV] = useState(initial);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Modal
      title={v.id ? `Edit coupon` : 'New coupon'}
      wide
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSave(v)}>{busy ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div className="form-grid">
        <label className="field"><span>Code *</span><input className="input" value={v.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></label>
        <label className="field"><span>Type *</span>
          <select className="input" value={v.type} onChange={(e) => set('type', e.target.value)}>
            <option value="PERCENT">Percent</option><option value="FLAT">Flat</option>
          </select>
        </label>
        <label className="field"><span>Value * {v.type === 'PERCENT' ? '(%)' : '(₹)'}</span><input className="input" type="number" step="0.01" value={v.value} onChange={(e) => set('value', e.target.value)} /></label>
        <label className="field"><span>Max discount (₹)</span><input className="input" type="number" step="0.01" value={v.max_discount} onChange={(e) => set('max_discount', e.target.value)} /></label>
        <label className="field"><span>Event ID (blank = all)</span><input className="input" type="number" value={v.event_id} onChange={(e) => set('event_id', e.target.value)} /></label>
        <label className="field"><span>Ticket type ID (optional)</span><input className="input" type="number" value={v.ticket_type_id} onChange={(e) => set('ticket_type_id', e.target.value)} /></label>
        <label className="field"><span>Min qty</span><input className="input" type="number" value={v.min_qty} onChange={(e) => set('min_qty', e.target.value)} /></label>
        <label className="field"><span>Min amount (₹)</span><input className="input" type="number" step="0.01" value={v.min_amount} onChange={(e) => set('min_amount', e.target.value)} /></label>
        <label className="field"><span>Usage limit (blank = ∞)</span><input className="input" type="number" value={v.usage_limit} onChange={(e) => set('usage_limit', e.target.value)} /></label>
        <label className="field"><span>Per-user limit</span><input className="input" type="number" value={v.per_user_limit} onChange={(e) => set('per_user_limit', e.target.value)} /></label>
        <label className="field"><span>Valid from</span><input type="datetime-local" className="input" value={v.valid_from} onChange={(e) => set('valid_from', e.target.value)} /></label>
        <label className="field"><span>Valid to</span><input type="datetime-local" className="input" value={v.valid_to} onChange={(e) => set('valid_to', e.target.value)} /></label>
        <label className="field"><span>Status</span>
          <select className="input" value={v.status} onChange={(e) => set('status', Number(e.target.value))}>
            <option value={1}>Active</option><option value={0}>Inactive</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
