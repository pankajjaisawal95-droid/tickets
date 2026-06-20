import { useEffect, useState } from 'react';
import { get, post } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';

// Who the broadcast goes to. 'all' is NOT event-scoped — it hits every user in the DB.
const AUDIENCES = [
  { value: 'booked', label: 'Booked attendees' },
  { value: 'cancelled', label: 'Cancelled attendees' },
  { value: 'both', label: 'Booked + Cancelled' },
  { value: 'all', label: 'All users in system' },
];

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Mirrors the backend buildAnnouncementHtml() so the preview matches the email
// the recipient actually receives. Keep in sync with email.helper.js.
const buildAnnouncementHtml = ({ subject, message }) => {
  const body = esc(message).replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f4f5fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:14px;padding:28px;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${esc(subject)}</h1>
      <div style="font-size:15px;line-height:1.6;color:#374151;">${body}</div>
    </div>
  </div>
</body></html>`;
};

/**
 * Dedicated "Email Attendees" page — pick an event, choose the audience
 * (booked / cancelled / both / all users), see the recipient count, compose a
 * subject + message, and broadcast it.
 */
export default function Broadcast() {
  const toast = useToast();
  const { data: eventsData } = useFetch(() => get('/admin/events'));
  const events = eventsData?.rows || [];

  const [eventId, setEventId] = useState('');
  const [audience, setAudience] = useState('booked');
  const [count, setCount] = useState(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!eventId) { setCount(null); return; }
    let alive = true;
    setCount(null);
    get(`/admin/events/${eventId}/attendees`, { audience })
      .then((r) => alive && setCount(r?.count ?? 0))
      .catch(() => alive && setCount(0));
    return () => { alive = false; };
  }, [eventId, audience]);

  const audienceLabel = AUDIENCES.find((a) => a.value === audience)?.label || 'recipients';

  const send = async () => {
    if (!eventId) { toast.error('Select an event'); return; }
    if (!subject.trim() || !message.trim()) { toast.error('Subject and message are required'); return; }
    if (!count) { toast.error('No recipients to email'); return; }
    const who = audience === 'all' ? 'ALL users in the system' : audienceLabel.toLowerCase();
    if (!window.confirm(`Send this email to ${count} recipient(s) (${who})? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await post(`/admin/events/${eventId}/broadcast`, { subject, message, audience });
      toast.success(`Sent to ${r.sent} of ${r.total}${r.failed ? ` · ${r.failed} failed` : ''}`);
      setSubject(''); setMessage('');
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head"><h1>Email Attendees</h1></div>

      <div className="panel" style={{ padding: 20, maxWidth: 680 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Send an announcement to the selected recipients. The chosen event is used
          for the email branding (banner &amp; title).
        </p>

        <label className="field full"><span>Event *</span>
          <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Select an event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </label>

        <label className="field full" style={{ marginTop: 10 }}><span>Send to *</span>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        {audience === 'all' && (
          <p className="muted" style={{ fontSize: 12, marginTop: 6, color: 'var(--bad-fg)' }}>
            ⚠ This goes to every user in the database, not just this event.
          </p>
        )}

        {eventId && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {count == null
              ? 'Counting recipients…'
              : `${count} recipient${count === 1 ? '' : 's'} with an email.`}
          </p>
        )}

        <label className="field full" style={{ marginTop: 10 }}><span>Subject *</span>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Gate timings & entry details"
          />
        </label>

        <label className="field full" style={{ marginTop: 10 }}><span>Message *</span>
          <textarea
            className="input"
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message to attendees…"
          />
        </label>

        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <button
            className="btn"
            disabled={!subject.trim() && !message.trim()}
            onClick={() => setPreview(true)}
            type="button"
          >
            Preview email
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !eventId || !count}
            onClick={send}
            type="button"
          >
            {busy ? 'Sending…' : `Send${count ? ` to ${count} recipient${count === 1 ? '' : 's'}` : ''}`}
          </button>
        </div>
      </div>

      {preview && (
        <Modal title="Email preview" onClose={() => setPreview(false)} wide
          footer={<button className="btn" onClick={() => setPreview(false)}>Close</button>}>
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            This is exactly how the email appears to the recipient.
          </p>
          <iframe
            title="email-preview"
            srcDoc={buildAnnouncementHtml({ subject, message })}
            style={{ width: '100%', height: 460, border: '1px solid var(--border)', borderRadius: 8, background: '#f4f5fb' }}
          />
        </Modal>
      )}
    </div>
  );
}
