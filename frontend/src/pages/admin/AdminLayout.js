// src/pages/admin/AdminLayout.js
import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Sidebar    from '../../components/layout/Sidebar';
import MobileNav  from '../../components/layout/MobileNav';
import ThemeControl from '../../components/ui/ThemeControl';

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
};

export default function AdminLayout() {
  const loc = useLocation();
  return (
    <div className="layout">
      <Sidebar role="admin" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{titles[loc.pathname] || 'Sany Adventures Admin'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeControl compact />
            <Link to="/" className="btn btn-ghost btn-sm">
              <i data-lucide="external-link" style={{ width: 13, height: 13 }} /> View Site
            </Link>
          </div>
        </div>
        <div className="page-content"><Outlet /></div>
      </div>
      <MobileNav role="admin" />
    </div>
  );
}
