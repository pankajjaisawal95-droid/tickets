import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import AdminLayout from './components/AdminLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Events from './pages/Events.jsx';
import EventForm from './pages/EventForm.jsx';
import Organizers from './pages/Organizers.jsx';
import Coupons from './pages/Coupons.jsx';
import Orders from './pages/Orders.jsx';
import Refunds from './pages/Refunds.jsx';
import Tickets from './pages/Tickets.jsx';
import HomeSections from './pages/HomeSections.jsx';
import Users from './pages/Users.jsx';
import EmailHistory from './pages/EmailHistory.jsx';
import Broadcast from './pages/Broadcast.jsx';
import Payments from './pages/Payments.jsx';
import VisitLogs from './pages/VisitLogs.jsx';
import Contacts from './pages/Contacts.jsx';
import Reviews from './pages/Reviews.jsx';

function RequireAuth({ children }) {
  const isAuthed = useAuth((s) => !!s.accessToken);
  return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<EventForm />} />
        <Route path="/events/:id" element={<EventForm />} />
        <Route path="/organizers" element={<Organizers />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/home-sections" element={<HomeSections />} />
        <Route path="/users" element={<Users />} />
        <Route path="/email-history" element={<EmailHistory />} />
        <Route path="/broadcast" element={<Broadcast />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/visit-logs" element={<VisitLogs />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/reviews" element={<Reviews />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
