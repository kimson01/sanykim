// src/pages/user/UserLayout.js
import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import Sidebar    from '../../components/layout/Sidebar';
import MobileNav  from '../../components/layout/MobileNav';
import ThemeControl from '../../components/ui/ThemeControl';

const titles = {
  '/dashboard':         'Dashboard',
  '/dashboard/tickets': 'My Tickets',
  '/dashboard/history': 'Purchase History',
  '/dashboard/profile': 'My Profile',
};

export default function UserLayout() {
  const loc = useLocation();
  return (
    <div className="layout">
      <Sidebar role="user" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{titles[loc.pathname] || 'My Account'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeControl compact />
            <Link to="/" className="btn btn-ghost btn-sm">
              <i data-lucide="search" style={{ width: 13, height: 13 }} /> Browse Events
            </Link>
          </div>
        </div>
        <div className="page-content"><Outlet /></div>
      </div>
      <MobileNav role="user" />
    </div>
  );
}
