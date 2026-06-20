import { useState } from 'react';
import { get, patch, assetUrl } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { dateTime } from '../lib/format.js';

/**
 * Organisers + KYC approval. Organisers self-register from the organiser portal
 * (kyc_status = PENDING) and submit bank/KYC details there. Admin reviews those
 * details here and approves/rejects. `/admin/organizers` returns a plain array
 * (also used by the EventForm dropdown), so this uses useFetch + a simple table.
 */
const KYC_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED'];

export default function Organizers() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => get('/admin/organizers'));
  const [savingId, setSavingId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const setKyc = async (row, kyc_status) => {
    if (kyc_status === row.kyc_status) return;
    setSavingId(row.id);
    try {
      await patch(`/admin/organizers/${row.id}/kyc`, { kyc_status });
      toast.success(`KYC set to ${kyc_status.toLowerCase()}`);
      setViewing((v) => (v && v.id === row.id ? { ...v, kyc_status } : v));
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const rows = data || [];

  return (
    <div>
      <div className="page-head">
        <h1>Organisers</h1>
      </div>

      {loading && !data && <div className="empty">Loading organisers…</div>}
      {error && !data && <div className="notice notice-bad">{error}</div>}

      {data && (
        <div className="panel" style={{ padding: 0 }}>
          <table className="mini-table">
            <thead>
              <tr>
                <th>ID</th><th>Organisation</th><th>Contact</th><th>Mobile</th>
                <th>Bank</th><th>KYC</th><th>Joined</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="muted">No organisers yet</td></tr>}
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td><strong>{o.organization_name || o.user_name || `Organizer #${o.id}`}</strong></td>
                  <td>{o.contact_email || o.email || '—'}</td>
                  <td>{o.mobile || '—'}</td>
                  <td>{o.bank_account_number ? `${o.bank_name || 'Bank'} ••••${String(o.bank_account_number).slice(-4)}` : '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <StatusBadge value={o.kyc_status} />
                      <select
                        className="input input-mini"
                        value={o.kyc_status || 'PENDING'}
                        disabled={savingId === o.id}
                        onChange={(e) => setKyc(o, e.target.value)}
                      >
                        {KYC_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </span>
                  </td>
                  <td>{o.created_at ? dateTime(o.created_at) : '—'}</td>
                  <td><button className="btn btn-sm" onClick={() => setViewing(o)}>View KYC</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <Modal
          title={`KYC — ${viewing.organization_name || viewing.user_name || `#${viewing.id}`}`}
          onClose={() => setViewing(null)}
          footer={
            <>
              <button className="btn btn-primary" disabled={savingId === viewing.id} onClick={() => setKyc(viewing, 'APPROVED')}>✓ Approve</button>
              <button className="btn btn-danger" disabled={savingId === viewing.id} onClick={() => setKyc(viewing, 'REJECTED')}>✕ Reject</button>
              <button className="btn" onClick={() => setViewing(null)}>Close</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Status" value={<StatusBadge value={viewing.kyc_status} />} />
            <Field label="Submitted" value={viewing.kyc_submitted_at ? dateTime(viewing.kyc_submitted_at) : '—'} />
            <Field label="Mobile" value={viewing.mobile || '—'} />
            <Field label="Email" value={viewing.contact_email || viewing.email || '—'} />
            <Field label="PAN" value={viewing.pan || '—'} />
            <Field label="GST number" value={viewing.gst_number || '—'} />
            <Field label="Account holder" value={viewing.bank_account_holder || '—'} />
            <Field label="Account number" value={viewing.bank_account_number || '—'} />
            <Field label="IFSC" value={viewing.bank_ifsc || '—'} />
            <Field label="Bank" value={viewing.bank_name || '—'} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <DocLink label="PAN document" url={viewing.pan_doc_url} />
            <DocLink label="GST document" url={viewing.gst_doc_url} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return <div><span className="muted">{label}</span><div>{value}</div></div>;
}

function DocLink({ label, url }) {
  if (!url) return <div><span className="muted">{label}</span><div>—</div></div>;
  return (
    <div>
      <span className="muted">{label}</span>
      <div><a href={assetUrl(url)} target="_blank" rel="noreferrer">View document ↗</a></div>
    </div>
  );
}
