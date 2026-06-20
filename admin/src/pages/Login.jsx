import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { useToast } from '../components/Toast.jsx';

/*
 * Admin login — dedicated, password-based, separate from the user OTP flow:
 *   POST /admin/auth/login { mobile, password } -> { accessToken, refreshToken, user }
 * Admin accounts are provisioned with the seed script
 * (backend: npm run seed:admin -- --mobile <m> --password <p>).
 */
export default function Login() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((s) => s.login);
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[0-9]{10}$/.test(mobile)) return toast.error('Enter a valid 10-digit mobile');
    if (!password) return toast.error('Enter your password');
    setBusy(true);
    try {
      const data = await post('/admin/auth/login', { mobile, password });
      login({ accessToken: data.accessToken, refreshToken: data.refreshToken, mobile });
      toast.success('Logged in');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">🎟️ Ticket Admin</div>
        <p className="muted">Sign in with your admin credentials</p>

        <form onSubmit={submit}>
          <label className="field">
            <span>Mobile number</span>
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
