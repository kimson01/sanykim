// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeBootstrap } from './components/ui/ThemeControl';

// Public
import LandingPage        from './pages/public/LandingPage';
import EventDetail        from './pages/public/EventDetail';
import CheckoutPage           from './pages/public/CheckoutPage';
import OrganizerProfilePage   from './pages/public/OrganizerProfilePage';
import CustomerCarePage       from './pages/public/CustomerCarePage';

// Auth
import LoginPage          from './pages/auth/LoginPage';
import RegisterPage       from './pages/auth/RegisterPage';
import ForgotPasswordPage  from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage   from './pages/auth/ResetPasswordPage';
import VerifyEmailPage     from './pages/auth/VerifyEmailPage';

// Admin
import AdminLayout        from './pages/admin/AdminLayout';
import AdminDashboard     from './pages/admin/AdminDashboard';
import AdminOrganizers    from './pages/admin/AdminOrganizers';
import AdminUsers         from './pages/admin/AdminUsers';
import AdminEvents        from './pages/admin/AdminEvents';
import AdminTransactions  from './pages/admin/AdminTransactions';
import AdminLogs          from './pages/admin/AdminLogs';
import AdminSettings      from './pages/admin/AdminSettings';
import AdminPayouts       from './pages/admin/AdminPayouts';
import AdminConflicts     from './pages/admin/AdminConflicts';

// Organizer
import OrgLayout          from './pages/organizer/OrgLayout';
import OrgDashboard       from './pages/organizer/OrgDashboard';
import OrgEvents          from './pages/organizer/OrgEvents';
import OrgAttendees       from './pages/organizer/OrgAttendees';
import OrgScan            from './pages/organizer/OrgScan';
import OrgAnalytics       from './pages/organizer/OrgAnalytics';
import OrgEarnings        from './pages/organizer/OrgEarnings';
import OrgConflicts       from './pages/organizer/OrgConflicts';

// User
import UserLayout         from './pages/user/UserLayout';
import UserDashboard      from './pages/user/UserDashboard';
import UserTickets        from './pages/user/UserTickets';
import UserHistory        from './pages/user/UserHistory';
import UserProfile        from './pages/user/UserProfile';

// ── Route guard ────────────────────────────────────────────────
const RequireAuth = ({ children, roles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ThemeBootstrap />
        <Routes>
          {/* Public */}
          <Route path="/"                element={<LandingPage />} />
          <Route path="/events/:id"      element={<EventDetail />} />
          <Route
            path="/customer-care"
            element={<RequireAuth roles={['user', 'organizer', 'admin']}><CustomerCarePage /></RequireAuth>}
          />
          <Route
            path="/checkout/:id"
            element={<RequireAuth roles={['user']}><CheckoutPage /></RequireAuth>}
          />
          <Route path="/organisers/:slug" element={<OrganizerProfilePage />} />

          {/* Auth */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />

          {/* Admin */}
          <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminLayout /></RequireAuth>}>
            <Route index                 element={<AdminDashboard />} />
            <Route path="events"         element={<AdminEvents />} />
            <Route path="organizers"     element={<AdminOrganizers />} />
            <Route path="users"          element={<AdminUsers />} />
            <Route path="transactions"   element={<AdminTransactions />} />
            <Route path="logs"           element={<AdminLogs />} />
            <Route path="conflicts"      element={<AdminConflicts />} />
            <Route path="settings"       element={<AdminSettings />} />
            <Route path="payouts"        element={<AdminPayouts />} />
          </Route>

          {/* Organizer */}
          <Route path="/organizer" element={<RequireAuth roles={['organizer', 'admin']}><OrgLayout /></RequireAuth>}>
            <Route index               element={<OrgDashboard />} />
            <Route path="events"       element={<OrgEvents />} />
            <Route path="attendees"    element={<OrgAttendees />} />
            <Route path="scan"         element={<OrgScan />} />
            <Route path="analytics"    element={<OrgAnalytics />} />
            <Route path="earnings"     element={<OrgEarnings />} />
            <Route path="conflicts"    element={<OrgConflicts />} />
          </Route>

          {/* User */}
          <Route path="/dashboard" element={<RequireAuth roles={['user', 'organizer', 'admin']}><UserLayout /></RequireAuth>}>
            <Route index             element={<UserDashboard />} />
            <Route path="tickets"    element={<UserTickets />} />
            <Route path="history"    element={<UserHistory />} />
            <Route path="profile"    element={<UserProfile />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
