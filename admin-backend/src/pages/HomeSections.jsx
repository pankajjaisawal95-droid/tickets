import { useEffect, useState } from 'react';
import { get, post, put, del, patch } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const BLANK = { title: '', type_id: '', item_limit: 10, layout: 'grid', status: 1 };

export default function HomeSections() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([get('/admin/home-sections'), get('/admin/home-section-types')])
      .then(([s, t]) => { setRows(s); setTypes(t); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persistOrder = async (next) => {
    setRows(next);
    try { await patch('/admin/home-sections/reorder', { items: next.map((r, i) => ({ id: r.id, sort_order: i })) }); }
    catch (err) { toast.error(err.message); load(); }
  };

  const onDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) return setDragIdx(null);
    const next = [...rows];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setDragIdx(null);
    persistOrder(next);
  };

  const toggle = async (r) => {
    try { await put(`/admin/home-sections/${r.id}`, { status: r.status ? 0 : 1 }); load(); }
    catch (err) { toast.error(err.message); }
  };

  const save = async (vals) => {
    setBusy(true);
    try {
      if (vals.id) await put(`/admin/home-sections/${vals.id}`, vals);
      else await post('/admin/home-sections', vals);
      toast.success('Saved'); setEditing(null); load();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await del(`/admin/home-sections/${confirm.id}`); toast.success('Removed'); setConfirm(null); load(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Home Sections</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK })}>+ New Section</button>
      </div>
      <p className="subtle">Drag the ⠿ handle to reorder. Order is saved automatically.</p>

      {loading ? <div className="empty">Loading…</div> : (
        <ul className="list-reorder">
          {rows.length === 0 && <div className="empty">No sections yet</div>}
          {rows.map((r, i) => (
            <li
              key={r.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className={dragIdx === i ? 'dragging' : ''}
            >
              <span className="grip">⠿</span>
              <div style={{ flex: 1 }}>
                <strong>{r.title}</strong>
                <div className="subtle">
                  type: {r.type_name || r.type_code || r.type_id} · layout: {r.layout} · limit: {r.item_limit}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => toggle(r)}><StatusBadge value={r.status} /></button>
              <button className="btn btn-sm" onClick={() => setEditing({
                id: r.id, title: r.title, type_id: r.type_id, item_limit: r.item_limit, layout: r.layout, status: r.status
              })}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirm(r)}>Del</button>
            </li>
          ))}
        </ul>
      )}

      {editing && <SectionModal initial={editing} types={types} busy={busy} onSave={save} onClose={() => setEditing(null)} />}
      {confirm && <ConfirmModal title="Delete section" message={`Delete "${confirm.title}"? This removes it from the homepage.`} confirmLabel="Delete" busy={busy} onConfirm={remove} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function SectionModal({ initial, types, onSave, onClose, busy }) {
  const [v, setV] = useState(initial);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Modal
      title={v.id ? 'Edit section' : 'New section'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => {
          if (!v.title) return;
          if (!v.type_id) return;
          onSave(v);
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <label className="field"><span>Title *</span><input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label className="field"><span>Type *</span>
        <select className="input" value={v.type_id} onChange={(e) => set('type_id', Number(e.target.value))}>
          <option value="">— Select —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name || t.code}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label className="field"><span>Item limit</span><input className="input" type="number" value={v.item_limit} onChange={(e) => set('item_limit', Number(e.target.value))} /></label>
        <label className="field"><span>Layout</span>
          <select className="input" value={v.layout} onChange={(e) => set('layout', e.target.value)}>
            <option value="grid">grid</option><option value="list">list</option><option value="carousel">carousel</option>
          </select>
        </label>
      </div>
      <label className="field"><span>Status</span>
        <select className="input" value={v.status} onChange={(e) => set('status', Number(e.target.value))}>
          <option value={1}>Active</option><option value={0}>Inactive</option>
        </select>
      </label>
    </Modal>
  );
}
