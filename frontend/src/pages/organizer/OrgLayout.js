// src/pages/organizer/OrgLayout.js
import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Sidebar    from '../../components/layout/Sidebar';
import MobileNav  from '../../components/layout/MobileNav';
import ThemeControl from '../../components/ui/ThemeControl';

const titles = {
  '/organizer': 'Dashboard', '/organizer/events': 'My Events',
  '/organizer/attendees': 'Attendees', '/organizer/scan': 'Scan Tickets',
  '/organizer/analytics': 'Analytics',
  '/organizer/earnings':  'Earnings & Payouts',
  '/organizer/conflicts': 'Customer Conflicts',
};

export default function OrgLayout() {
  const loc = useLocation();
  return (
    <div className="layout">
      <Sidebar role="organizer" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{titles[loc.pathname] || 'Organizer'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeControl compact />
            <Link to="/" className="btn btn-ghost btn-sm">
              <i data-lucide="external-link" style={{ width: 13, height: 13 }} /> View Site
            </Link>
          </div>
        </div>
        <div className="page-content"><Outlet /></div>
      </div>
      <MobileNav role="organizer" />
    </div>
  );
}
