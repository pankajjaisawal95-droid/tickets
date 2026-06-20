import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import OrganiserLayout from './components/OrganiserLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Events from './pages/Events.jsx';
import EventForm from './pages/EventForm.jsx';
import CreateEvent from './pages/CreateEvent.jsx';
import EventAnalytics from './pages/EventAnalytics.jsx';
import Kyc from './pages/Kyc.jsx';
import Profile from './pages/Profile.jsx';

function RequireAuth({ children }) {
  const isAuthed = useAuth((s) => !!s.accessToken);
  return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <RequireAuth>
            <OrganiserLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<CreateEvent />} />
        <Route path="/events/:id" element={<EventForm />} />
        <Route path="/events/:id/analytics" element={<EventAnalytics />} />
        <Route path="/kyc" element={<Kyc />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
