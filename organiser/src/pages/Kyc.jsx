import { useEffect, useState } from 'react';
import { get, put } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import ImageUpload from '../components/ImageUpload.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

/**
 * Organiser KYC + bank payout details. Saving (re)submits for admin review
 * (kyc_status → PENDING). An admin approves it on their Organisers page; only
 * then can the organiser submit events.
 */
const BLANK = {
  pan: '', gst_number: '',
  bank_account_holder: '', bank_account_number: '', bank_ifsc: '', bank_name: '',
  pan_doc_url: '', gst_doc_url: ''
};

const Hint = ({ children }) => (
  <span style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>{children}</span>
);

export default function Kyc() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => get('/organiser/kyc'));
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        pan: data.pan || '', gst_number: data.gst_number || '',
        bank_account_holder: data.bank_account_holder || '', bank_account_number: data.bank_account_number || '',
        bank_ifsc: data.bank_ifsc || '', bank_name: data.bank_name || '',
        pan_doc_url: data.pan_doc_url || '', gst_doc_url: data.gst_doc_url || ''
      });
    }
  }, [data]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.bank_account_holder.trim() || !form.bank_account_number.trim() || !form.bank_ifsc.trim()) {
      return toast.error('Account holder, account number and IFSC are required');
    }
    setSaving(true);
    try {
      await put('/organiser/kyc', form);
      toast.success('KYC submitted for review');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <div className="empty">Loading KYC…</div>;
  if (error && !data) return <div className="notice notice-bad">{error}</div>;

  return (
    <div className="ev-page">
      <div className="page-head">
        <div>
          <h1>KYC &amp; Bank Details</h1>
          <p className="muted">Payout account &amp; tax details, reviewed by an admin.</p>
        </div>
        {data && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>Status</span>
            <StatusBadge value={data.kyc_status} />
          </span>
        )}
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        Saving re-submits your profile for review (status returns to <strong>PENDING</strong>). You can
        submit events for publishing only once your KYC is <strong>APPROVED</strong>.
      </div>

      <form className="panel" style={{ padding: 22 }} onSubmit={save}>
        <div className="section-title" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Bank payout details</div>
        <div className="form-grid">
          <label className="field full"><span>Account holder <span className="req">*</span></span>
            <input className="input" placeholder="As per bank records"
              value={form.bank_account_holder} onChange={(e) => set('bank_account_holder', e.target.value)} />
          </label>
          <label className="field"><span>Account number <span className="req">*</span></span>
            <input className="input" inputMode="numeric" maxLength={18} placeholder="000123456789"
              value={form.bank_account_number} onChange={(e) => set('bank_account_number', e.target.value.replace(/\D/g, ''))} />
            <Hint>Digits only, up to 18.</Hint>
          </label>
          <label className="field"><span>IFSC <span className="req">*</span></span>
            <input className="input" maxLength={11} placeholder="HDFC0001234" style={{ textTransform: 'uppercase' }}
              value={form.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value.toUpperCase().slice(0, 11))} />
            <Hint>4 letters, 0, then 6 alphanumerics.</Hint>
          </label>
          <label className="field full"><span>Bank name</span>
            <input className="input" placeholder="HDFC Bank"
              value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
          </label>
        </div>

        <div className="section-title">Tax &amp; identity</div>
        <div className="form-grid">
          <label className="field"><span>PAN</span>
            <input className="input" maxLength={10} placeholder="ABCDE1234F" style={{ textTransform: 'uppercase' }}
              value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase().slice(0, 10))} />
            <Hint>10 characters (5 letters, 4 digits, 1 letter).</Hint>
          </label>
          <label className="field"><span>GST number</span>
            <input className="input" maxLength={15} placeholder="27ABCDE1234F1Z5" style={{ textTransform: 'uppercase' }}
              value={form.gst_number} onChange={(e) => set('gst_number', e.target.value.toUpperCase().slice(0, 15))} />
            <Hint>15 characters (optional).</Hint>
          </label>
          <div className="field">
            <ImageUpload label="PAN document" folder="kyc" value={form.pan_doc_url} onChange={(v) => set('pan_doc_url', v)} />
          </div>
          <div className="field">
            <ImageUpload label="GST document" folder="kyc" value={form.gst_doc_url} onChange={(v) => set('gst_doc_url', v)} />
          </div>
        </div>

        <div className="row ev-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save & submit for review'}</button>
        </div>
      </form>
    </div>
  );
}
