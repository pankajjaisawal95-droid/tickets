import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/events', label: 'Events' },
  { to: '/organizers', label: 'Organisers' },
  { to: '/coupons', label: 'Coupons' },
  { to: '/orders', label: 'Orders' },
  { to: '/refunds', label: 'Refunds' },
  { to: '/tickets', label: 'Tickets & Scans' },
  { to: '/home-sections', label: 'Home Sections' },
  { to: '/users', label: 'Users & Validators' },
  { to: '/email-history', label: 'Email History' },
  { to: '/broadcast', label: 'Email Attendees' },
  { to: '/payments', label: 'Payments' },
  { to: '/visit-logs', label: 'Visit Logs' },
  { to: '/contacts', label: 'Contact Messages' },
  { to: '/reviews', label: 'Reviews' }
];

export default function AdminLayout() {
  const { mobile, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">🎟️ Ticket Admin</div>
        <nav>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="spacer" />
          <div className="user-box">
            <span className="muted">{mobile || 'admin'}</span>
            <button className="btn btn-sm" onClick={onLogout}>Logout</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
