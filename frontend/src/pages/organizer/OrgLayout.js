// src/pages/organizer/OrgLayout.js
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar    from '../../components/layout/Sidebar';
import MobileNav  from '../../components/layout/MobileNav';
import NotificationMenu from '../../components/layout/NotificationMenu';
import ThemeControl from '../../components/ui/ThemeControl';
import { useAuth } from '../../context/AuthContext';

const titles = {
  '/organizer': 'Dashboard', '/organizer/events': 'My Events',
  '/organizer/attendees': 'Attendees', '/organizer/scan': 'Scan Tickets',
  '/organizer/analytics': 'Analytics',
  '/organizer/earnings':  'Earnings & Payouts',
  '/organizer/conflicts': 'Customer Conflicts',
  '/organizer/profile':   'Profile',
};

export default function OrgLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <Sidebar role="organizer" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{titles[loc.pathname] || 'Organizer'}</span>
          <div className="responsive-actions">
            <NotificationMenu />
            <ThemeControl compact />
            <Link to="/" className="btn btn-ghost btn-sm">
              <i data-lucide="external-link" style={{ width: 13, height: 13 }} /> View Site
            </Link>
            <div className="topbar-account">
              <div className="avatar avatar-blue" style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>
                {user?.name?.[0] || 'O'}
              </div>
              <div className="topbar-account-meta">
                <span className="topbar-account-name">{user?.name || 'Organizer'}</span>
                <span className="topbar-account-role">Organizer</span>
              </div>
              <Link to="/organizer/profile" className="btn btn-secondary btn-sm mobile-only-action">
                <i data-lucide="user-cog" style={{ width: 13, height: 13 }} /> Profile
              </Link>
              <button
                className="btn btn-danger btn-sm mobile-only-action"
                onClick={() => { logout(); navigate('/'); }}
              >
                <i data-lucide="log-out" style={{ width: 13, height: 13 }} /> Logout
              </button>
            </div>
          </div>
        </div>
        <div className="page-content"><Outlet /></div>
      </div>
      <MobileNav role="organizer" />
    </div>
  );
}
