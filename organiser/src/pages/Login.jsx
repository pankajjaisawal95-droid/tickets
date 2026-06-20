import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { useToast } from '../components/Toast.jsx';
import AuthLayout from '../components/auth/AuthLayout.jsx';

/*
 * Organiser login — email + password (separate from the customer OTP flow):
 *   POST /organiser/auth/login { email, password } -> { accessToken, refreshToken, user }
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((s) => s.login);
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return toast.error('Enter a valid email');
    if (!password) return toast.error('Enter your password');
    setBusy(true);
    try {
      const data = await post('/organiser/auth/login', { email, password });
      login({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      toast.success('Logged in');
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
        <div className="authcard__head">
          <h2>Welcome back</h2>
          <p>Sign in to manage your events, tickets and seating.</p>
        </div>

        <form className="authcard__form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" placeholder="Your password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="authcard__switch">
          New organiser? <Link to="/register">Create an account</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
