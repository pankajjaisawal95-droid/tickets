import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { useToast } from '../components/Toast.jsx';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import Icon from '../components/ui/Icon.jsx';

/*
 * Organiser self-registration — two steps:
 *   1. org details + mobile + email + password → POST /organiser/auth/register/send-otp
 *   2. OTP texted to the mobile → POST /organiser/auth/register (creates the account)
 * New organisers start with kyc_status = PENDING; an admin approves before they
 * can submit events. Future logins use email + password.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [form, setForm] = useState({ organization_name: '', email: '', mobile: '', password: '' });
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((s) => s.login);
  const toast = useToast();
  const navigate = useNavigate();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validateDetails = () => {
    if (!form.organization_name.trim()) { toast.error('Enter your organisation name'); return false; }
    if (!EMAIL_RE.test(form.email)) { toast.error('Enter a valid email'); return false; }
    if (!/^[0-9]{10}$/.test(form.mobile)) { toast.error('Enter a valid 10-digit mobile'); return false; }
    if (form.password.length < 4) { toast.error('Password must be at least 4 characters'); return false; }
    return true;
  };

  const sendOtp = async (e) => {
    e?.preventDefault();
    if (!validateDetails()) return;
    setBusy(true);
    try {
      await post('/organiser/auth/register/send-otp', { mobile: form.mobile, email: form.email });
      toast.success('OTP sent to your mobile');
      setStep('otp');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyAndRegister = async (e) => {
    e.preventDefault();
    if (!/^[0-9]{4}$/.test(otp)) return toast.error('Enter the 4-digit OTP');
    setBusy(true);
    try {
      const data = await post('/organiser/auth/register', { ...form, otp });
      login({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      toast.success('Account created');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="authcard animate-fade-up">
        {step === 'details' ? (
          <>
            <div className="authcard__head">
              <h2>Create your account</h2>
              <p>Just your details — we'll text an OTP to verify your mobile.</p>
            </div>
            <form className="authcard__form" onSubmit={sendOtp}>
              <label className="field">
                <span>Organisation name</span>
                <input className="input" placeholder="Acme Events" value={form.organization_name}
                  onChange={(e) => set('organization_name', e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" placeholder="you@example.com" value={form.email}
                  onChange={(e) => set('email', e.target.value)} />
              </label>
              <label className="field">
                <span>Mobile number</span>
                <input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit mobile"
                  value={form.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" type="password" placeholder="Choose a password" value={form.password}
                  onChange={(e) => set('password', e.target.value)} />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Sending OTP…' : 'Send OTP'}
              </button>
            </form>
            <div className="authcard__switch">
              Already registered? <Link to="/login">Sign in</Link>
            </div>
          </>
        ) : (
          <>
            <div className="otp-illo"><Icon name="shield" size={30} /></div>
            <div className="authcard__head authcard__head--center">
              <h2>Verify your mobile</h2>
              <p>Enter the 4-digit OTP sent to +91 {form.mobile}</p>
            </div>
            <form className="authcard__form" onSubmit={verifyAndRegister}>
              <input
                className="input"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
                style={{ textAlign: 'center', letterSpacing: '0.6em', fontSize: '1.4rem', fontWeight: 700 }}
              />
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & create account'}
              </button>
            </form>
            <div className="otp-resend">
              <button type="button" disabled={busy} onClick={() => setStep('details')}>← Edit details</button>
              {'  ·  '}
              <button type="button" disabled={busy} onClick={sendOtp}>Resend OTP</button>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
