import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, put } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../store/auth.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Icon from '../components/ui/Icon.jsx';
import { useToast } from '../components/Toast.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Profile() {
  const toast = useToast();
  const { user, login, accessToken, refreshToken } = useAuth();
  const { data: me, reload } = useFetch(() => get('/organiser/me'));

  const [profile, setProfile] = useState({ organization_name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (me) setProfile({ organization_name: me.organization_name || '', email: me.email || me.contact_email || '' });
  }, [me]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile.organization_name.trim()) return toast.error('Organisation name is required');
    if (!EMAIL_RE.test(profile.email)) return toast.error('Enter a valid email');
    setSavingProfile(true);
    try {
      const res = await put('/organiser/profile', profile);
      // Keep the topbar / store in sync with the new name + email.
      login({ accessToken, refreshToken, user: { ...user, organization_name: res.organization_name, email: res.email } });
      toast.success('Profile updated');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!pw.current_password) return toast.error('Enter your current password');
    if (pw.new_password.length < 4) return toast.error('New password must be at least 4 characters');
    if (pw.new_password !== pw.confirm) return toast.error('New passwords do not match');
    setSavingPw(true);
    try {
      await put('/organiser/password', { current_password: pw.current_password, new_password: pw.new_password });
      toast.success('Password changed');
      setPw({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPw(false);
    }
  };

  const initial = (me?.organization_name?.[0] || me?.email?.[0] || 'O').toUpperCase();
  const approved = me?.kyc_status === 'APPROVED';

  return (
    <div className="ev-page">
      <div className="page-head">
        <div>
          <h1>Profile &amp; Settings</h1>
          <p className="muted">Manage your account details and password.</p>
        </div>
      </div>

      {/* Identity header */}
      <div className="panel profile-hero">
        <span className="user-avatar user-avatar--xl">{initial}</span>
        <div className="profile-hero__id">
          <strong>{me?.organization_name || 'Organiser'}</strong>
          <span className="profile-hero__meta">
            <span><Icon name="mail" size={14} /> {me?.email || me?.contact_email || '—'}</span>
            <span><Icon name="phone" size={14} /> +91 {me?.mobile || '—'}</span>
          </span>
        </div>
        <div className="profile-hero__kyc">
          <span className="muted" style={{ fontSize: 12 }}>KYC</span>
          {me ? <StatusBadge value={me.kyc_status} /> : null}
          {!approved && <Link className="btn btn-sm" to="/kyc" style={{ marginTop: 6 }}>Complete KYC</Link>}
        </div>
      </div>

      <div className="profile-grid">
        {/* Account details */}
        <form className="panel" style={{ padding: 22 }} onSubmit={saveProfile}>
          <div className="section-title" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Account details</div>
          <div className="field"><span>Organisation name</span>
            <input className="input" value={profile.organization_name} onChange={(e) => setProfile((p) => ({ ...p, organization_name: e.target.value }))} />
          </div>
          <div className="field"><span>Email (login)</span>
            <input className="input" type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="field"><span>Mobile</span>
            <input className="input" value={me?.mobile || ''} disabled readOnly />
            <span style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>Mobile can't be changed — it verifies your account.</span>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>

        {/* Change password */}
        <form className="panel" style={{ padding: 22 }} id="password" onSubmit={changePassword}>
          <div className="section-title" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Change password</div>
          <div className="field"><span>Current password</span>
            <input className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} />
          </div>
          <div className="field"><span>New password</span>
            <input className="input" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} />
            <span style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>At least 4 characters.</span>
          </div>
          <div className="field"><span>Confirm new password</span>
            <input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn btn-primary" disabled={savingPw}>{savingPw ? 'Updating…' : 'Update password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
