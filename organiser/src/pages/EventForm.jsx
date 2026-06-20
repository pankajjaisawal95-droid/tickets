import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post, put, del } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { useFetch } from '../lib/useFetch.js';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ImageUpload from '../components/ImageUpload.jsx';
import { inr, toLocalInput, toSqlDateTime } from '../lib/format.js';

/* Required fields for an event (validated before save). Organiser owns the
   content; approval_status / is_active / organizer_id are server-owned. */
const REQUIRED = {
  title: 'Title',
  venue: 'Venue',
  category_id: 'Category',
  start_datetime: 'Start date/time',
  end_datetime: 'End date/time',
  banner_url: 'Banner image'
};

const BLANK = {
  title: '', description: '', venue: '', banner_url: '', banner_url_mobile: '', cart_url: '',
  category_id: '', start_datetime: '', end_datetime: '',
  gst_percent: '', convenience_fee_percent: '', convenience_fee_flat: '', gst_inclusive: 0
};

export default function EventForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { data: cats } = useFetch(() => get('/organiser/categories'));
  const { data, loading, error, reload } = useFetch(
    () => (isEdit ? get(`/organiser/events/${id}`) : Promise.resolve(null)),
    [id]
  );

  useEffect(() => {
    if (data?.event) {
      const e = data.event;
      setForm({
        title: e.title || '', description: e.description || '', venue: e.venue || '',
        banner_url: e.banner_url || '', banner_url_mobile: e.banner_url_mobile || '', cart_url: e.cart_url || '',
        category_id: e.category_id || '',
        start_datetime: toLocalInput(e.start_datetime), end_datetime: toLocalInput(e.end_datetime),
        gst_percent: e.gst_percent ?? '', convenience_fee_percent: e.convenience_fee_percent ?? '',
        convenience_fee_flat: e.convenience_fee_flat ?? '', gst_inclusive: e.gst_inclusive ? 1 : 0
      });
    }
  }, [data]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => (er[k] ? { ...er, [k]: undefined } : er));
  };

  const validate = () => {
    const er = {};
    for (const [k, label] of Object.entries(REQUIRED)) {
      const val = form[k];
      if (val === '' || val === null || val === undefined) er[k] = `${label} is required`;
    }
    if (form.start_datetime && form.end_datetime && new Date(form.end_datetime) < new Date(form.start_datetime)) {
      er.end_datetime = 'End must be after start';
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!validate()) return toast.error('Please fill all required fields');
    setSaving(true);
    const payload = {
      ...form,
      category_id: form.category_id || null,
      start_datetime: toSqlDateTime(form.start_datetime),
      end_datetime: toSqlDateTime(form.end_datetime),
      gst_percent: form.gst_percent === '' ? null : form.gst_percent,
      convenience_fee_percent: form.convenience_fee_percent === '' ? null : form.convenience_fee_percent,
      convenience_fee_flat: form.convenience_fee_flat === '' ? null : form.convenience_fee_flat
    };
    try {
      if (isEdit) {
        await put(`/organiser/events/${id}`, payload);
        toast.success('Event updated');
        reload();
      } else {
        const res = await post('/organiser/events', payload);
        toast.success('Event created');
        navigate(`/events/${res.id}`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Only show the full-page loader on the FIRST load (no data yet). On reload()
  // after an action, keep the page mounted so the scroll position is preserved.
  if (isEdit && loading && !data) return <div className="empty">Loading event…</div>;
  if (isEdit && error && !data) return <div className="notice notice-bad">{error}</div>;

  const ev = data?.event;

  return (
    <div className="ev-page">
      <div className="page-head">
        <div>
          <h1>{isEdit ? `Edit Event #${id}` : 'New Event'}</h1>
          <p className="muted">{isEdit ? 'Update details, tickets, seating and media for your event.' : 'Fill in the details below to create your event.'}</p>
        </div>
        <button className="btn" onClick={() => navigate('/events')}>← Back</button>
      </div>

      {isEdit && ev && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Approval: <strong>{ev.approval_status}</strong>{' · '}
          {ev.is_active ? 'Live on the public site' : 'Not yet published'}.{' '}
          {ev.approval_status !== 'APPROVED' && 'An admin reviews and publishes your event after you submit it.'}
        </div>
      )}

      <form className="panel" style={{ padding: 20, marginBottom: 22 }} onSubmit={save}>
        <div className="form-grid">
          <label className="field full">
            <span>Title <span className="req">*</span></span>
            <input className={`input ${errors.title ? 'invalid' : ''}`} value={form.title} onChange={(e) => set('title', e.target.value)} />
            {errors.title && <span className="err-text">{errors.title}</span>}
          </label>
          <label className="field full">
            <span>Description</span>
            <textarea className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <label className="field">
            <span>Venue <span className="req">*</span></span>
            <input className={`input ${errors.venue ? 'invalid' : ''}`} value={form.venue} onChange={(e) => set('venue', e.target.value)} />
            {errors.venue && <span className="err-text">{errors.venue}</span>}
          </label>
          <label className="field">
            <span>Category <span className="req">*</span></span>
            <select className={`input ${errors.category_id ? 'invalid' : ''}`} value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">— Select —</option>
              {(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.category_id && <span className="err-text">{errors.category_id}</span>}
          </label>
          <label className="field">
            <span>Starts <span className="req">*</span></span>
            <input type="datetime-local" className={`input ${errors.start_datetime ? 'invalid' : ''}`} value={form.start_datetime} onChange={(e) => set('start_datetime', e.target.value)} />
            {errors.start_datetime && <span className="err-text">{errors.start_datetime}</span>}
          </label>
          <label className="field">
            <span>Ends <span className="req">*</span></span>
            <input type="datetime-local" className={`input ${errors.end_datetime ? 'invalid' : ''}`} value={form.end_datetime} onChange={(e) => set('end_datetime', e.target.value)} />
            {errors.end_datetime && <span className="err-text">{errors.end_datetime}</span>}
          </label>
          <div className="field full">
            <ImageUpload label="Banner image *" folder="event" value={form.banner_url} onChange={(v) => set('banner_url', v)} />
            {errors.banner_url && <span className="err-text">{errors.banner_url}</span>}
          </div>
          <div className="field full">
            <ImageUpload label="Banner image (mobile)" folder="event" value={form.banner_url_mobile} onChange={(v) => set('banner_url_mobile', v)} />
          </div>
          <div className="field full">
            <ImageUpload label="Cart / thumbnail image" folder="event" value={form.cart_url} onChange={(v) => set('cart_url', v)} />
          </div>
        </div>

        <div className="section-title">Pricing rules (optional — blank = none)</div>
        <div className="form-grid">
          <label className="field"><span>GST %</span><input className="input" type="number" step="0.01" value={form.gst_percent} onChange={(e) => set('gst_percent', e.target.value)} /></label>
          <label className="field"><span>Convenience fee %</span><input className="input" type="number" step="0.01" value={form.convenience_fee_percent} onChange={(e) => set('convenience_fee_percent', e.target.value)} /></label>
          <label className="field"><span>Convenience fee flat (₹)</span><input className="input" type="number" step="0.01" value={form.convenience_fee_flat} onChange={(e) => set('convenience_fee_flat', e.target.value)} /></label>
          <label className="field"><span>GST inclusive?</span>
            <select className="input" value={form.gst_inclusive} onChange={(e) => set('gst_inclusive', Number(e.target.value))}>
              <option value={0}>No (added on top)</option>
              <option value={1}>Yes (included in price)</option>
            </select>
          </label>
        </div>

        <div className="row ev-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create event')}</button>
        </div>
      </form>

      {isEdit && (
        <>
          <TicketTypes eventId={id} types={data?.ticket_types || []} reload={reload} />
          <SeatLayoutImport eventId={id} reload={reload} />
          <MediaManager eventId={id} gallery={data?.gallery || []} artists={data?.artists || []} reload={reload} />
        </>
      )}
    </div>
  );
}

/* -------------------------- seating layout (CSV) -------------------------- */
// Ready-to-edit template. "|" = aisle gap between blocks.
const SEAT_TEMPLATE_CSV = [
  'Section,Row,Blocks',
  'Platinum,A,1-7|8-14',
  'Platinum,B,1-4|5-11|12-18|19-22',
  'Diamond,C,1-5|6-14|15-23|24-28',
  'Gold,F,1-5|6-14|15-23|24-28',
  'Silver,I,1-6|7-15|16-24|25-30',
  'Bronze,O,1-10|11-20|21-30',
].join('\n');

function SeatLayoutImport({ eventId, reload }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const blob = new Blob([SEAT_TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seating-layout-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onImport = async () => {
    if (!file) { toast.error('Choose a .csv file first'); return; }
    setBusy(true);
    try {
      const csv = await file.text();
      const res = await post(`/organiser/events/${eventId}/seatmap/import`, { csv });
      const parts = (res?.sections || []).map((s) => `${s.section}: ${s.seats}`).join(', ');
      toast.success(`Imported ${res?.total ?? 0} seats${parts ? ` (${parts})` : ''}`);
      setFile(null);
      reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Seating layout (CSV import)</div>
        <button className="btn btn-sm" type="button" onClick={downloadTemplate}>↓ Download template</button>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Columns: <b>Section, Row, Blocks</b>. Section = ticket-type name. Blocks split by
        <b> |</b> (aisle gap), ranges by <b>-</b> (e.g. <code>1-5|6-14|15-23</code>). Importing
        replaces all seats of the referenced sections and marks them seated.
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn btn-sm btn-primary" type="button" disabled={busy || !file} onClick={onImport}>
          {busy ? 'Importing…' : 'Import layout'}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- ticket types ------------------------------ */
function TicketTypes({ eventId, types, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // object or 'new'
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const blank = { name: '', description: '', price: '', total_quantity: '', max_per_user: '', gst_percent: '', sale_start: '', sale_end: '', image: '', status: 1, seating_mode: 'GA' };

  const onSave = async (vals) => {
    setBusy(true);
    try {
      const payload = {
        ...vals,
        gst_percent: vals.gst_percent === '' ? null : vals.gst_percent,
        max_per_user: vals.max_per_user === '' ? null : Number(vals.max_per_user),
        sale_start: toSqlDateTime(vals.sale_start),
        sale_end: toSqlDateTime(vals.sale_end)
      };
      if (editing === 'new') await post(`/organiser/events/${eventId}/ticket-types`, payload);
      else await put(`/organiser/ticket-types/${editing.id}`, payload);
      toast.success('Saved');
      setEditing(null);
      reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const onDelete = async () => {
    setBusy(true);
    try { await del(`/organiser/ticket-types/${confirm.id}`); toast.success('Removed'); setConfirm(null); reload(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ marginTop: 0 }}>Ticket types</div>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>+ Add type</button>
      </div>
      <table className="mini-table">
        <thead><tr><th>Name</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Max/User</th><th className="num">Sold</th><th>GST%</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {types.length === 0 && <tr><td colSpan={8} className="muted">No ticket types yet</td></tr>}
          {types.map((t) => (
            <tr key={t.id}>
              <td>
                {t.name}
                {t.seating_mode === 'SEATED' && (
                  <span className="badge" style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#eef2ff', color: '#4647d3' }}>
                    Seated{t.seat_count ? ` · ${t.seat_count}` : ''}
                  </span>
                )}
              </td>
              <td className="num">{inr(t.price)}</td>
              <td className="num">{t.total_quantity}</td>
              <td className="num">{t.max_per_user ?? '—'}</td>
              <td className="num">{t.sold_quantity ?? 0}</td>
              <td>{t.gst_percent ?? '—'}</td>
              <td><StatusBadge value={t.status} /></td>
              <td className="num">
                <button className="btn btn-sm" onClick={() => setEditing(t)}>Edit</button>{' '}
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm(t)}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <TicketTypeModal
          initial={editing === 'new' ? blank : {
            name: editing.name || '', description: editing.description || '', price: editing.price ?? '',
            total_quantity: editing.total_quantity ?? '', max_per_user: editing.max_per_user ?? '',
            gst_percent: editing.gst_percent ?? '',
            sale_start: toLocalInput(editing.sale_start), sale_end: toLocalInput(editing.sale_end),
            image: editing.image || '', status: editing.status ?? 1,
            seating_mode: editing.seating_mode || 'GA'
          }}
          isNew={editing === 'new'}
          typeId={editing === 'new' ? null : editing.id}
          busy={busy}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
      {confirm && (
        <ConfirmModal title="Remove ticket type" message={`Soft-delete "${confirm.name}"?`} confirmLabel="Remove" busy={busy} onConfirm={onDelete} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function TicketTypeModal({ initial, isNew, typeId, onSave, onClose, busy }) {
  const [v, setV] = useState(initial);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const isSeated = v.seating_mode === 'SEATED';
  return (
    <Modal
      title={isNew ? 'Add ticket type' : 'Edit ticket type'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSave(v)}>{busy ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div className="form-grid">
        <label className="field full"><span>Name *</span><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="field full"><span>Description</span><input className="input" value={v.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="field"><span>Price (₹) *</span><input className="input" type="number" step="0.01" value={v.price} onChange={(e) => set('price', e.target.value)} /></label>
        <label className="field"><span>Booking mode</span>
          <select className="input" value={v.seating_mode} onChange={(e) => set('seating_mode', e.target.value)}>
            <option value="GA">General admission (quantity)</option>
            <option value="SEATED">Reserved seats</option>
          </select>
        </label>
        <label className="field"><span>Total quantity</span>
          <input className="input" type="number" value={v.total_quantity}
            onChange={(e) => set('total_quantity', e.target.value)}
            readOnly={isSeated}
            title={isSeated ? 'Set automatically from the seat grid' : undefined} />
        </label>
        <label className="field"><span>Max per user</span><input className="input" type="number" min="1" placeholder="Unlimited" value={v.max_per_user} onChange={(e) => set('max_per_user', e.target.value)} /></label>
        <label className="field"><span>GST %</span><input className="input" type="number" step="0.01" value={v.gst_percent} onChange={(e) => set('gst_percent', e.target.value)} /></label>
        <label className="field"><span>Status</span>
          <select className="input" value={v.status} onChange={(e) => set('status', Number(e.target.value))}>
            <option value={1}>Active</option><option value={0}>Inactive</option>
          </select>
        </label>
        <label className="field"><span>Sale start</span><input type="datetime-local" className="input" value={v.sale_start} onChange={(e) => set('sale_start', e.target.value)} /></label>
        <label className="field"><span>Sale end</span><input type="datetime-local" className="input" value={v.sale_end} onChange={(e) => set('sale_end', e.target.value)} /></label>
        <div className="field full">
          <ImageUpload label="Ticket image" folder="ticket" value={v.image} onChange={(url) => set('image', url)} />
        </div>
        {isSeated && (
          <div className="field full">
            <SeatGridManager typeId={typeId} onGenerated={(total) => set('total_quantity', total)} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* Generates and previews the seat grid for a SEATED ticket type. The type must
   exist first (seats need a ticket_type_id), so for an unsaved new type it just
   tells the organiser to save first. */
function SeatGridManager({ typeId, onGenerated }) {
  const toast = useToast();
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(10);
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // seat being edited
  const [seatDraft, setSeatDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [renamingRow, setRenamingRow] = useState(null); // row label being renamed
  const [rowDraft, setRowDraft] = useState('');

  const loadSeats = async () => {
    if (!typeId) return;
    try {
      const res = await get(`/organiser/ticket-types/${typeId}/seats`);
      setSeats(Array.isArray(res) ? res : []);
    } catch (err) { toast.error(err.message); }
  };

  useEffect(() => { loadSeats(); /* eslint-disable-next-line */ }, [typeId]);

  const generate = async () => {
    if (!typeId) return;
    const r = Number(rows), c = Number(cols);
    if (!r || !c) { toast.error('Enter rows and columns'); return; }
    setLoading(true);
    try {
      const res = await post(`/organiser/ticket-types/${typeId}/seats/generate`, { rows: r, cols: c });
      toast.success('Seat grid generated');
      onGenerated?.(res?.total ?? r * c);
      setSelected(null);
      await loadSeats();
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };

  // Click a seat to edit it. Booked seats are locked.
  const selectSeat = (s) => {
    if (s.booked) { toast.error('Seat is booked — locked'); return; }
    setSelected(s);
    setSeatDraft({ seat_label: s.seat_label, row_label: s.row_label, col_number: s.col_number });
  };

  const saveSeat = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await put(`/organiser/seats/${selected.id}`, {
        seat_label: seatDraft.seat_label,
        row_label: seatDraft.row_label,
        col_number: Number(seatDraft.col_number) || 0,
      });
      toast.success('Seat updated');
      setSelected(null);
      await loadSeats();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  // Disable (remove from sale) or re-enable a seat.
  const toggleSeat = async (s) => {
    setSaving(true);
    try {
      await put(`/organiser/seats/${s.id}`, { status: s.status ? 0 : 1 });
      toast.success(s.status ? 'Seat disabled' : 'Seat enabled');
      setSelected(null);
      await loadSeats();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  // Rename a whole row (e.g. C -> CD); every seat in it is relabelled C1->CD1 …
  const renameRow = async (from, to) => {
    const t = String(to).trim();
    if (!t || t === from) { setRenamingRow(null); return; }
    setSaving(true);
    try {
      await put(`/organiser/ticket-types/${typeId}/seats/rename-row`, { from, to: t });
      toast.success(`Row ${from} → ${t}`);
      setRenamingRow(null);
      setSelected(null);
      await loadSeats();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  // group seats by row for the preview
  const byRow = {};
  for (const s of seats) (byRow[s.row_label] ||= []).push(s);
  const rowKeys = Object.keys(byRow);

  return (
    <div className="panel" style={{ padding: 14, background: '#fafafe' }}>
      <div className="section-title" style={{ marginTop: 0, fontSize: 14 }}>Seat grid</div>
      {!typeId ? (
        <p className="muted" style={{ margin: 0 }}>Save the ticket type first, then reopen it to generate seats.</p>
      ) : (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ maxWidth: 90 }}><span>Rows</span>
              <input className="input" type="number" min="1" value={rows} onChange={(e) => setRows(e.target.value)} /></label>
            <label className="field" style={{ maxWidth: 90 }}><span>Columns</span>
              <input className="input" type="number" min="1" value={cols} onChange={(e) => setCols(e.target.value)} /></label>
            <button className="btn btn-sm btn-primary" type="button" disabled={loading} onClick={generate}>
              {loading ? 'Generating…' : (seats.length ? 'Regenerate grid' : 'Generate grid')}
            </button>
          </div>
          {seats.some((s) => s.booked) && (
            <p className="muted" style={{ marginTop: 8, fontSize: 12, color: '#c0392b' }}>
              Some seats are booked — regenerating is blocked until they free up.
            </p>
          )}
          {rowKeys.length > 0 && (
            <div style={{ marginTop: 12, overflowX: 'auto' }}>
              {rowKeys.map((rk) => (
                <div key={rk} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  {renamingRow === rk ? (
                    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                      <input autoFocus className="input" style={{ width: 52, height: 22, padding: '0 4px', fontSize: 11 }}
                        value={rowDraft} onChange={(e) => setRowDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') renameRow(rk, rowDraft); if (e.key === 'Escape') setRenamingRow(null); }} />
                      <button className="btn btn-sm" type="button" disabled={saving} title="Save" style={{ padding: '0 5px' }} onClick={() => renameRow(rk, rowDraft)}>✓</button>
                      <button className="btn btn-sm" type="button" title="Cancel" style={{ padding: '0 5px' }} onClick={() => setRenamingRow(null)}>×</button>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center', minWidth: 40 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{rk}</span>
                      <button className="btn btn-sm" type="button" title={`Rename row ${rk}`} style={{ padding: '0 4px', lineHeight: '18px' }}
                        onClick={() => { setRenamingRow(rk); setRowDraft(rk); }}>✎</button>
                    </span>
                  )}
                  {byRow[rk].map((s) => (
                    <span key={s.id} title={s.booked ? `${s.seat_label} · booked (locked)` : `${s.seat_label} · click to edit`}
                      onClick={() => selectSeat(s)}
                      style={{
                        width: 22, height: 22, borderRadius: 4, fontSize: 9, lineHeight: '22px',
                        textAlign: 'center', userSelect: 'none',
                        cursor: s.booked ? 'not-allowed' : 'pointer',
                        background: s.booked ? '#fee2e2' : (s.status ? '#e0e7ff' : '#e5e7eb'),
                        color: s.booked ? '#b91c1c' : '#4647d3',
                        opacity: s.status ? 1 : 0.5,
                        outline: selected?.id === s.id ? '2px solid #4647d3' : 'none'
                      }}>
                      {s.col_number}
                    </span>
                  ))}
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
                {seats.length} seats · <span style={{ color: '#b91c1c' }}>red = booked</span> ·
                grey = disabled · click a seat to edit
              </div>
            </div>
          )}

          {selected && (
            <div className="panel" style={{ marginTop: 10, padding: 12, background: '#fff' }}>
              <div className="section-title" style={{ marginTop: 0, fontSize: 13 }}>Edit seat “{selected.seat_label}”</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label className="field" style={{ maxWidth: 110 }}><span>Label</span>
                  <input className="input" value={seatDraft.seat_label || ''}
                    onChange={(e) => setSeatDraft((d) => ({ ...d, seat_label: e.target.value }))} /></label>
                <label className="field" style={{ maxWidth: 80 }}><span>Row</span>
                  <input className="input" value={seatDraft.row_label || ''}
                    onChange={(e) => setSeatDraft((d) => ({ ...d, row_label: e.target.value }))} /></label>
                <label className="field" style={{ maxWidth: 80 }}><span>Col</span>
                  <input className="input" type="number" value={seatDraft.col_number ?? ''}
                    onChange={(e) => setSeatDraft((d) => ({ ...d, col_number: e.target.value }))} /></label>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn-sm btn-primary" type="button" disabled={saving} onClick={saveSeat}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="btn btn-sm" type="button" disabled={saving} onClick={() => toggleSeat(selected)}>
                  {selected.status ? 'Disable seat' : 'Enable seat'}
                </button>
                <button className="btn btn-sm" type="button" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                Disabling removes the seat from sale. Booked seats can’t be edited or disabled.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ media manager ----------------------------- */
function MediaManager({ eventId, gallery, artists, reload }) {
  return (
    <div className="panel" style={{ padding: 18, marginBottom: 22 }}>
      <div className="section-title" style={{ marginTop: 0 }}>Media</div>
      <MediaList
        title="Gallery"
        rows={gallery}
        cols={[{ k: 'image_url', label: 'Image URL' }, { k: 'caption', label: 'Caption' }]}
        addFields={[{ k: 'image_url', label: 'Image URL', required: true }, { k: 'caption', label: 'Caption' }]}
        onAdd={(b) => post(`/organiser/event/${eventId}/gallery`, b)}
        onUpdate={(id, b) => put(`/organiser/event/gallery/${id}`, b)}
        onDelete={(id) => del(`/organiser/event/gallery/${id}`)}
        onReorder={(items) => put('/organiser/event/gallery/reorder', { items })}
        reload={reload}
      />
      <MediaList
        title="Artists"
        rows={artists}
        cols={[{ k: 'name', label: 'Name' }, { k: 'role', label: 'Role' }, { k: 'image_url', label: 'Image URL' }]}
        addFields={[{ k: 'name', label: 'Name', required: true }, { k: 'role', label: 'Role' }, { k: 'image_url', label: 'Image URL' }]}
        onAdd={(b) => post(`/organiser/event/${eventId}/artist`, b)}
        onUpdate={(id, b) => put(`/organiser/event/artist/${id}`, b)}
        onDelete={(id) => del(`/organiser/event/artist/${id}`)}
        onReorder={(items) => put('/organiser/event/artist/reorder', { items })}
        reload={reload}
      />
    </div>
  );
}

function MediaList({ title, rows, cols, addFields, onAdd, onUpdate, onDelete, onReorder, reload }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({});
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const folderForImage = title === 'Artists' ? 'artist' : 'gallery';

  const renderFields = (d, setD) => addFields.map((f) => (
    f.k === 'image_url'
      ? <ImageUpload key={f.k} label={`${f.label}${f.required ? ' *' : ''}`} folder={folderForImage}
          value={d[f.k] || ''} onChange={(url) => setD((s) => ({ ...s, [f.k]: url }))} />
      : (
        <label className="field" key={f.k} style={{ maxWidth: 320 }}>
          <span>{f.label}{f.required ? ' *' : ''}</span>
          <input className="input" placeholder={f.label} value={d[f.k] || ''}
            onChange={(e) => setD((s) => ({ ...s, [f.k]: e.target.value }))} />
        </label>
      )
  ));

  const add = async () => {
    for (const f of addFields) if (f.required && !draft[f.k]) return toast.error(`${f.label} is required`);
    setBusy(true);
    try { await onAdd(draft); toast.success('Added'); setDraft({}); setAdding(false); reload(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const startEdit = (r) => { setEditId(r.id); setEditDraft({ ...r }); setAdding(false); };
  const cancelEdit = () => { setEditId(null); setEditDraft({}); };

  const saveEdit = async () => {
    for (const f of addFields) if (f.required && !editDraft[f.k]) return toast.error(`${f.label} is required`);
    setBusy(true);
    try {
      const body = {};
      addFields.forEach((f) => { body[f.k] = editDraft[f.k] ?? ''; });
      await onUpdate(editId, body);
      toast.success('Updated'); cancelEdit(); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const move = async (idx, dir) => {
    const next = [...rows];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    try { await onReorder(next.map((r, i) => ({ id: r.id, sort_order: i }))); reload(); }
    catch (err) { toast.error(err.message); }
  };

  const remove = async (id) => {
    try { await onDelete(id); toast.success('Removed'); reload(); } catch (err) { toast.error(err.message); }
  };

  const toggle = async (r) => {
    try { await onUpdate(r.id, { status: r.status ? 0 : 1 }); reload(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{title}</strong>
        <button className="btn btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : '+ Add'}</button>
      </div>
      {adding && (
        <div style={{ margin: '10px 0' }}>
          {renderFields(draft, setDraft)}
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={add}>Save</button>
        </div>
      )}
      <table className="mini-table">
        <thead><tr>{cols.map((c) => <th key={c.k}>{c.label}</th>)}<th>Status</th><th>Order</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length + 3} className="muted">None</td></tr>}
          {rows.map((r, i) => (
            <Fragment key={r.id}>
              <tr>
                {cols.map((c) => <td key={c.k} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[c.k] || '—'}</td>)}
                <td><button className="btn btn-sm" onClick={() => toggle(r)}><StatusBadge value={r.status} /></button></td>
                <td className="num">
                  <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>{' '}
                  <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</button>
                </td>
                <td className="num">
                  <button className="btn btn-sm" onClick={() => (editId === r.id ? cancelEdit() : startEdit(r))}>
                    {editId === r.id ? 'Close' : 'Edit'}
                  </button>{' '}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>Del</button>
                </td>
              </tr>
              {editId === r.id && (
                <tr>
                  <td colSpan={cols.length + 3} style={{ background: '#f9fafb' }}>
                    {renderFields(editDraft, setEditDraft)}
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <button className="btn btn-sm btn-primary" disabled={busy} onClick={saveEdit}>{busy ? 'Saving…' : 'Save changes'}</button>
                      <button className="btn btn-sm" disabled={busy} onClick={cancelEdit}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
