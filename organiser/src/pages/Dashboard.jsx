import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../store/auth.js';
import { num } from '../lib/format.js';

/**
 * Organiser dashboard — a KYC status banner + a quick count of the organiser's
 * own events by approval state. `/organiser/me` is the source of truth for KYC
 * (re-synced into the auth store so the layout/header stay current).
 */
export default function Dashboard() {
  const { user, login, accessToken, refreshToken } = useAuth();
  const { data: me } = useFetch(() => get('/organiser/me'));
  const { data: events, loading, error } = useFetch(() => get('/organiser/events', { limit: 200 }));

  // Keep the persisted user (org name / kyc_status) fresh from the server.
  useEffect(() => {
    if (me) login({ accessToken, refreshToken, user: { ...user, ...me } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const approved = me?.kyc_status === 'APPROVED';
  const rows = events?.rows || [];
  const byStatus = rows.reduce((acc, e) => {
    const k = (e.approval_status || 'PENDING').toUpperCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const published = rows.filter((e) => e.approval_status === 'APPROVED' && e.is_active).length;

  return (
    <div>
      <div className="page-head"><h1>Dashboard</h1></div>

      {me && !approved && (
        <div className="notice notice-bad" style={{ marginBottom: 18 }}>
          <strong>Account {String(me.kyc_status || 'PENDING').toLowerCase()} —</strong>{' '}
          your organiser account is awaiting admin approval. You can build event drafts now,
          but you can&apos;t submit them for review until you&apos;re approved.
        </div>
      )}
      {me && approved && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <strong>Account approved.</strong> You can submit events for admin review — approved &amp; active
          events go live on the public site.
        </div>
      )}

      <div className="cards">
        <Stat label="Total Events" value={num(rows.length)} />
        <Stat label="Pending Review" value={num(byStatus.PENDING || 0)} />
        <Stat label="Approved" value={num(byStatus.APPROVED || 0)} />
        <Stat label="Rejected" value={num(byStatus.REJECTED || 0)} />
        <Stat label="Live (published)" value={num(published)} />
      </div>

      <div className="panel" style={{ padding: 18, marginTop: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="section-title" style={{ marginTop: 0 }}>Your events</div>
          <Link className="btn btn-primary btn-sm" to="/events/new">+ New Event</Link>
        </div>
        {loading && !events && <div className="empty">Loading…</div>}
        {error && <div className="notice notice-bad">{error}</div>}
        {events && rows.length === 0 && <div className="empty">No events yet — create your first one.</div>}
        {rows.length > 0 && (
          <table className="mini-table">
            <thead><tr><th>Title</th><th>Approval</th><th>Live</th></tr></thead>
            <tbody>
              {rows.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/events/${e.id}`}>{e.title}</Link></td>
                  <td>{e.approval_status}</td>
                  <td>{e.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="panel stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
