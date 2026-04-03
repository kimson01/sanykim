// src/pages/admin/AdminLayout.js
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar    from '../../components/layout/Sidebar';
import MobileNav  from '../../components/layout/MobileNav';
import NotificationMenu from '../../components/layout/NotificationMenu';
import ThemeControl from '../../components/ui/ThemeControl';
import { useAuth } from '../../context/AuthContext';

const titles = {
  '/admin':              'Dashboard',
  '/admin/events':       'All Events',
  '/admin/organizers':   'Organizers',
  '/admin/users':        'Users',
  '/admin/transactions': 'Transactions',
  '/admin/logs':         'Admin Logs',
  '/admin/conflicts':    'Conflict Escalations',
  '/admin/settings':     'Settings',
  '/admin/payouts':      'Payouts & Commissions',
  '/admin/profile':      'Profile',
};

export default function AdminLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <Sidebar role="admin" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{titles[loc.pathname] || 'Sany Adventures Admin'}</span>
          <div className="responsive-actions">
            <NotificationMenu />
            <ThemeControl compact />
            <Link to="/" className="btn btn-ghost btn-sm">
              <i data-lucide="external-link" style={{ width: 13, height: 13 }} /> View Site
            </Link>
            <div className="topbar-account">
              <div className="avatar avatar-orange" style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>
                {user?.name?.[0] || 'A'}
              </div>
              <div className="topbar-account-meta">
                <span className="topbar-account-name">{user?.name || 'Admin'}</span>
                <span className="topbar-account-role">Admin</span>
              </div>
              <Link to="/admin/profile" className="btn btn-secondary btn-sm mobile-only-action">
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
      <MobileNav role="admin" />
    </div>
  );
}
