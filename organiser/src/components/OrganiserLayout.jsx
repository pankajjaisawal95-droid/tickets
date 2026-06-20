import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import Logo from './ui/Logo.jsx';
import Icon from './ui/Icon.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'layout', end: true },
  { to: '/events', label: 'My Events', icon: 'calendar' },
  { to: '/kyc', label: 'KYC & Bank', icon: 'card' },
  { to: '/profile', label: 'Profile', icon: 'user' }
];

export default function OrganiserLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);   // mobile drawer
  const [menu, setMenu] = useState(false);   // user dropdown

  const onLogout = () => { logout(); navigate('/login', { replace: true }); };
  const go = (to) => { setMenu(false); navigate(to); };

  const name = user?.organization_name || user?.email || 'Organiser';
  const initial = (user?.organization_name?.[0] || user?.email?.[0] || 'O').toUpperCase();

  return (
    <div className="layout">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand"><Logo /></div>
        <nav>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              style={{ display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <Icon name={n.icon} size={18} /> <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="spacer" />
          <div className="user-box" style={{ position: 'relative' }}>
            <button className="user-chip" onClick={() => setMenu((m) => !m)}>
              <span className="user-avatar">{initial}</span>
              <span className="user-name">{name}</span>
              <Icon name="arrowRight" size={14} style={{ transform: 'rotate(90deg)' }} />
            </button>
            {menu && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(false)} />
                <div className="user-menu">
                  <div className="user-menu__head">
                    <span className="user-avatar user-avatar--lg">{initial}</span>
                    <div className="user-menu__id">
                      <strong>{name}</strong>
                      <span>{user?.email}</span>
                    </div>
                  </div>
                  <div className="user-menu__sep" />
                  <button onClick={() => go('/profile')}><Icon name="user" size={16} /> Profile</button>
                  <button onClick={() => go('/profile#password')}><Icon name="shield" size={16} /> Change password</button>
                  <button onClick={() => go('/kyc')}><Icon name="card" size={16} /> KYC &amp; Bank</button>
                  <div className="user-menu__sep" />
                  <button className="danger" onClick={onLogout}><Icon name="logout" size={16} /> Logout</button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
