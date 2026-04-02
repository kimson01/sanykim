// src/pages/user/UserLayout.js
import React from 'react';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import Sidebar    from '../../components/layout/Sidebar';
import MobileNav  from '../../components/layout/MobileNav';
import ThemeControl from '../../components/ui/ThemeControl';
import { useAuth } from '../../context/AuthContext';

const titles = {
  '/dashboard':         'Dashboard',
  '/dashboard/tickets': 'My Tickets',
  '/dashboard/history': 'Purchase History',
  '/dashboard/profile': 'My Profile',
};

export default function UserLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isOrganizer = user?.role === 'organizer';
  const roleLabel = user?.role === 'organizer' ? 'Organizer' : 'Attendee';
  const avatarClass = isOrganizer ? 'avatar-blue' : 'avatar-green';
  return (
    <div className="layout">
      <Sidebar role="user" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{titles[loc.pathname] || 'My Account'}</span>
          <div className="responsive-actions">
            <ThemeControl compact />
            <Link to="/" className="btn btn-ghost btn-sm">
              <i data-lucide="search" style={{ width: 13, height: 13 }} /> Browse Events
            </Link>
            <div className="topbar-account">
              <div className={`avatar ${avatarClass}`} style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>
                {user?.name?.[0] || 'U'}
              </div>
              <div className="topbar-account-meta">
                <span className="topbar-account-name">{user?.name || 'Account'}</span>
                <span className="topbar-account-role">{roleLabel}</span>
              </div>
              <Link to="/dashboard/profile" className="btn btn-secondary btn-sm mobile-only-action">
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
      <MobileNav role="user" />
    </div>
  );
}
