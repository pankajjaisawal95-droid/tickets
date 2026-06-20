import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/Toast.jsx';
import ImageUpload from '../components/ImageUpload.jsx';
import Icon from '../components/ui/Icon.jsx';
import { toSqlDateTime } from '../lib/format.js';

/**
 * Tabbed Create-Event wizard (mirrors OrganiserUiReference):
 *   Event Details → Banners & Media → Date & Venue → Contact → Tickets → Review.
 * The selected tab shows its fields; the final tab previews everything and
 * publishes. On submit we create the event, then create each ticket type
 * against it, and land on the edit page (where seats & media live).
 */
const TABS = [
  { id: 'basics', label: 'Event Details', icon: 'info' },
  { id: 'media', label: 'Banners & Media', icon: 'image' },
  { id: 'schedule', label: 'Date & Venue', icon: 'calendar' },
  { id: 'contact', label: 'Contact', icon: 'phone' },
  { id: 'tickets', label: 'Tickets Type', icon: 'ticket' },
  { id: 'review', label: 'Review & Submit', icon: 'checkCircle' },
];

const PRESETS = [
  { name: 'Early Bird', price: 999 }, { name: 'General', price: 1499 },
  { name: 'Silver', price: 1999 }, { name: 'Gold', price: 2999 }, { name: 'VIP', price: 4999 },
];

let _seq = 0;
const makeTicket = (name = 'General', price = 1499) => ({ key: `t${_seq++}`, name, price: String(price), quantity: '100', maxPerOrder: '10' });

const BLANK = {
  title: '', category_id: '', description: '', visibility: 'public',
  banner_url: '', banner_url_mobile: '', cart_url: '',
  start_datetime: '', end_datetime: '', venue: '', city: '', state: '', country: 'India',
  contact_person: '', contact_number: '', contact_email: '', internal_notes: '',
  gst_percent: '', convenience_fee_percent: '', convenience_fee_flat: '', gst_inclusive: 0,
};

export default function CreateEvent() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: cats } = useFetch(() => get('/organiser/categories'));
  const [tab, setTab] = useState('basics');
  const [form, setForm] = useState(BLANK);
  const [tickets, setTickets] = useState([makeTicket('Early Bird', 999), makeTicket('General', 1499)]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const setTicket = (key, k, v) => setTickets((ts) => ts.map((t) => (t.key === key ? { ...t, [k]: v } : t)));
  const addTicket = (name, price) => setTickets((ts) => [...ts, makeTicket(name, price)]);
  const removeTicket = (key) => setTickets((ts) => ts.filter((t) => t.key !== key));

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Event name is required.';
    if (!form.start_datetime) e.start_datetime = 'Start date/time is required.';
    if (!form.end_datetime) e.end_datetime = 'End date/time is required.';
    if (!form.venue.trim()) e.venue = 'Venue is required.';
    if (form.start_datetime && form.end_datetime && new Date(form.end_datetime) < new Date(form.start_datetime)) {
      e.end_datetime = 'End must be after start.';
    }
    setErrors(e);
    return e;
  };

  const jumpToError = (e) => {
    if (e.title) setTab('basics');
    else if (e.start_datetime || e.end_datetime || e.venue) setTab('schedule');
  };

  const publish = async () => {
    const e = validate();
    if (Object.keys(e).length) { jumpToError(e); toast.error('Please fix the highlighted fields'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title, description: form.description, category_id: form.category_id || null,
        visibility: form.visibility,
        banner_url: form.banner_url, banner_url_mobile: form.banner_url_mobile, cart_url: form.cart_url,
        start_datetime: toSqlDateTime(form.start_datetime), end_datetime: toSqlDateTime(form.end_datetime),
        venue: form.venue, city: form.city, state: form.state, country: form.country,
        contact_person: form.contact_person, contact_number: form.contact_number,
        contact_email: form.contact_email, internal_notes: form.internal_notes,
        gst_percent: form.gst_percent === '' ? null : form.gst_percent,
        convenience_fee_percent: form.convenience_fee_percent === '' ? null : form.convenience_fee_percent,
        convenience_fee_flat: form.convenience_fee_flat === '' ? null : form.convenience_fee_flat,
        gst_inclusive: form.gst_inclusive,
      };
      const res = await post('/organiser/events', payload);
      const eventId = res.id;

      // Create the ticket types the organiser defined (best-effort).
      const valid = tickets.filter((t) => t.name.trim() && t.price !== '');
      let made = 0;
      for (const t of valid) {
        try {
          await post(`/organiser/events/${eventId}/ticket-types`, {
            name: t.name.trim(), price: Number(t.price),
            total_quantity: t.quantity === '' ? null : Number(t.quantity),
            max_per_user: t.maxPerOrder === '' ? null : Number(t.maxPerOrder),
            seating_mode: 'GA', status: 1,
          });
          made++;
        } catch { /* skip a bad ticket, keep going */ }
      }
      toast.success(`Event created${made ? ` with ${made} ticket type${made > 1 ? 's' : ''}` : ''}`);
      navigate(`/events/${eventId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const next = () => setTab(TABS[Math.min(TABS.length - 1, tabIndex + 1)].id);
  const prev = () => setTab(TABS[Math.max(0, tabIndex - 1)].id);

  return (
    <div className="ev-page ev-page--full">
      <div className="page-head">
        <div>
          <h1>Create Event</h1>
          <p className="muted">Fill in the details, configure tickets and review before publishing.</p>
        </div>
        <button className="btn" onClick={() => navigate('/events')}>← Back</button>
      </div>

      {/* Tab bar */}
      <div className="ev-tabs">
        {TABS.map((t, i) => (
          <button key={t.id} className={`ev-tab ${tab === t.id ? 'is-active' : ''} ${i < tabIndex ? 'is-done' : ''}`} onClick={() => setTab(t.id)}>
            <span className="ev-tab__num">{i + 1}</span>
            <Icon name={t.icon} size={16} /> <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="panel" style={{ padding: 22 }}>
        {/* 1 — Event Details */}
        {tab === 'basics' && (
          <div className="animate-fade-in">
            <div className="ev-secthead"><h3><Icon name="info" size={18} /> Event Details</h3><p>The essentials that describe your event.</p></div>
            <div className="form-grid">
              <label className="field full"><span>Event name <span className="req">*</span></span>
                <input className={`input ${errors.title ? 'invalid' : ''}`} placeholder="Sunburn Arena 2026" value={form.title} onChange={(e) => set('title', e.target.value)} />
                {errors.title && <span className="err-text">{errors.title}</span>}
              </label>
              <label className="field"><span>Category</span>
                <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Visibility</span>
                <select className="input" value={form.visibility} onChange={(e) => set('visibility', e.target.value)}>
                  <option value="public">Public</option>
                  <option value="private">Private (invite only)</option>
                  <option value="unlisted">Unlisted</option>
                </select>
              </label>
              <label className="field full"><span>Description</span>
                <textarea className="input" rows={4} placeholder="Describe your event, line-up, highlights…" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {/* 2 — Banners & Media */}
        {tab === 'media' && (
          <div className="animate-fade-in">
            <div className="ev-secthead"><h3><Icon name="image" size={18} /> Banners & Media</h3><p>Upload eye-catching artwork. PNG/JPG under 5MB.</p></div>
            <div className="form-grid">
              <div className="field">
                <ImageUpload label="Banner image" folder="event" value={form.banner_url} onChange={(v) => set('banner_url', v)} />
              </div>
              <div className="field">
                <ImageUpload label="Banner image (mobile)" folder="event" value={form.banner_url_mobile} onChange={(v) => set('banner_url_mobile', v)} />
              </div>
              <div className="field full">
                <ImageUpload label="Cart / thumbnail image" folder="event" value={form.cart_url} onChange={(v) => set('cart_url', v)} />
              </div>
            </div>
          </div>
        )}

        {/* 3 — Date & Venue */}
        {tab === 'schedule' && (
          <div className="animate-fade-in">
            <div className="ev-secthead"><h3><Icon name="calendar" size={18} /> Date & Venue</h3><p>When and where your event takes place.</p></div>
            <div className="form-grid">
              <label className="field"><span>Starts <span className="req">*</span></span>
                <input type="datetime-local" className={`input ${errors.start_datetime ? 'invalid' : ''}`} value={form.start_datetime} onChange={(e) => set('start_datetime', e.target.value)} />
                {errors.start_datetime && <span className="err-text">{errors.start_datetime}</span>}
              </label>
              <label className="field"><span>Ends <span className="req">*</span></span>
                <input type="datetime-local" className={`input ${errors.end_datetime ? 'invalid' : ''}`} value={form.end_datetime} onChange={(e) => set('end_datetime', e.target.value)} />
                {errors.end_datetime && <span className="err-text">{errors.end_datetime}</span>}
              </label>
              <label className="field full"><span>Venue name <span className="req">*</span></span>
                <input className={`input ${errors.venue ? 'invalid' : ''}`} placeholder="DY Patil Stadium" value={form.venue} onChange={(e) => set('venue', e.target.value)} />
                {errors.venue && <span className="err-text">{errors.venue}</span>}
              </label>
              <label className="field"><span>City</span><input className="input" placeholder="Navi Mumbai" value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
              <label className="field"><span>State</span><input className="input" placeholder="Maharashtra" value={form.state} onChange={(e) => set('state', e.target.value)} /></label>
              <label className="field"><span>Country</span><input className="input" value={form.country} onChange={(e) => set('country', e.target.value)} /></label>
            </div>
          </div>
        )}

        {/* 4 — Contact */}
        {tab === 'contact' && (
          <div className="animate-fade-in">
            <div className="ev-secthead"><h3><Icon name="phone" size={18} /> Contact & Notes</h3><p>Point of contact for attendees and internal notes.</p></div>
            <div className="form-grid">
              <label className="field"><span>Contact person</span><input className="input" placeholder="Aarav Sharma" value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} /></label>
              <label className="field"><span>Contact number</span><input className="input" inputMode="numeric" maxLength={10} placeholder="98765 43210" value={form.contact_number} onChange={(e) => set('contact_number', e.target.value.replace(/\D/g, ''))} /></label>
              <label className="field full"><span>Contact email</span><input className="input" type="email" placeholder="support@event.com" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} /></label>
              <label className="field full"><span>Organizer notes (internal)</span><textarea className="input" rows={3} placeholder="Any internal notes about this event…" value={form.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} /></label>
            </div>
          </div>
        )}

        {/* 5 — Tickets */}
        {tab === 'tickets' && (
          <div className="animate-fade-in">
            <div className="ev-secthead"><h3><Icon name="ticket" size={18} /> Ticket Types</h3><p>Add ticket types with pricing, quantity and per-order limits. Seats can be designed after creating the event.</p></div>
            <div className="tickets">
              <div className="tickets__presets">
                <span className="tickets__presets-label">Quick add:</span>
                {PRESETS.map((p) => (
                  <button type="button" key={p.name} className="chip" onClick={() => addTicket(p.name, p.price)}><Icon name="plus" size={13} /> {p.name}</button>
                ))}
              </div>

              {tickets.length === 0 ? (
                <div className="tickets__empty"><Icon name="ticket" size={28} /><p>No ticket types yet — add one above.</p></div>
              ) : (
                <div className="tickets__list">
                  {tickets.map((t, i) => (
                    <div className="ticket-card" key={t.key}>
                      <span className="ticket-card__bar" />
                      <div className="ticket-card__head">
                        <span className="ticket-card__no">Ticket #{i + 1}</span>
                        <button type="button" className="ticket-card__rm" onClick={() => removeTicket(t.key)} title="Remove"><Icon name="trash" size={16} /></button>
                      </div>
                      <div className="ticket-card__grid">
                        <label className="field"><span>Name</span><input className="input" value={t.name} onChange={(e) => setTicket(t.key, 'name', e.target.value)} /></label>
                        <label className="field"><span>Price (₹)</span><input className="input" type="number" step="0.01" value={t.price} onChange={(e) => setTicket(t.key, 'price', e.target.value)} /></label>
                        <label className="field"><span>Quantity</span><input className="input" type="number" value={t.quantity} onChange={(e) => setTicket(t.key, 'quantity', e.target.value)} /></label>
                        <label className="field"><span>Max / order</span><input className="input" type="number" value={t.maxPerOrder} onChange={(e) => setTicket(t.key, 'maxPerOrder', e.target.value)} /></label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => addTicket('General', 1499)}><Icon name="plus" size={15} /> Add ticket type</button>
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
          </div>
        )}

        {/* 6 — Review & Submit */}
        {tab === 'review' && (
          <div className="animate-fade-in">
            <div className="ev-secthead"><h3><Icon name="checkCircle" size={18} /> Review & Submit</h3><p>Double-check everything before publishing your event.</p></div>
            <div className="review-grid">
              <ReviewCard title="Event Details" rows={[['Name', form.title], ['Category', catName(cats, form.category_id)], ['Visibility', form.visibility]]} />
              <ReviewCard title="Date & Venue" rows={[['Starts', form.start_datetime || '—'], ['Ends', form.end_datetime || '—'], ['Venue', [form.venue, form.city, form.state].filter(Boolean).join(', ')]]} />
              <ReviewCard title="Contact" rows={[['Person', form.contact_person], ['Phone', form.contact_number], ['Email', form.contact_email]]} />
              <ReviewCard title="Tickets" rows={tickets.filter((t) => t.name.trim()).map((t) => [t.name, `₹${t.price} · ${t.quantity || '∞'} qty`])} empty="No ticket types added" />
            </div>
            <div className="review-final"><Icon name="info" size={18} /><span>On publish, your event is created as a <strong>draft</strong> pending admin approval. You can add seat maps & media next.</span></div>
          </div>
        )}

        {/* Footer nav */}
        <div className="ev-foot">
          <button className="btn" onClick={prev} disabled={tabIndex === 0}><Icon name="arrowLeft" size={15} /> Previous</button>
          <span className="muted" style={{ fontSize: 13 }}>Step {tabIndex + 1} of {TABS.length}</span>
          {tabIndex < TABS.length - 1 ? (
            <button className="btn btn-primary" onClick={next}>Next <Icon name="arrowRight" size={15} /></button>
          ) : (
            <button className="btn btn-primary" onClick={publish} disabled={saving}>{saving ? 'Publishing…' : 'Publish Event'} <Icon name="rocket" size={15} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function catName(cats, id) {
  const c = (cats || []).find((x) => String(x.id) === String(id));
  return c ? c.name : '—';
}

function ReviewCard({ title, rows, empty }) {
  const list = (rows || []).filter((r) => r[1] !== undefined && r[1] !== '');
  return (
    <div className="review-card">
      <h4>{title}</h4>
      {list.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{empty || '—'}</p> : list.map(([k, v]) => (
        <div className="review-row" key={k}><span className="k">{k}</span><span className="v">{v || '—'}</span></div>
      ))}
    </div>
  );
}
