// src/components/layout/MobileNav.js
// Bottom tab navigation for mobile screens (< 900px).
// Mirrors the sidebar nav items in a compact 4-tab bar.
import React from 'react';
import { NavLink } from 'react-router-dom';

// Each role gets max 5 items — only the most important ones
const adminItems = [
  { icon: 'layout-dashboard', label: 'Dashboard',  to: '/admin' },
  { icon: 'calendar',         label: 'Events',     to: '/admin/events' },
  { icon: 'users',            label: 'Organisers', to: '/admin/organizers' },
  { icon: 'scroll-text',      label: 'Logs',       to: '/admin/logs' },
  { icon: 'wallet',           label: 'Payouts',    to: '/admin/payouts' },
];

const orgItems = [
  { icon: 'layout-dashboard', label: 'Dashboard', to: '/organizer' },
  { icon: 'calendar',         label: 'Events',    to: '/organizer/events' },
  { icon: 'users',            label: 'Attendees', to: '/organizer/attendees' },
  { icon: 'shield-alert',     label: 'Conflicts', to: '/organizer/conflicts' },
  { icon: 'wallet',           label: 'Earnings',  to: '/organizer/earnings' },
];

const userItems = [
  { icon: 'home',             label: 'Explore',   to: '/' },
  { icon: 'layout-dashboard', label: 'Dashboard', to: '/dashboard' },
  { icon: 'ticket',           label: 'Tickets',   to: '/dashboard/tickets' },
  { icon: 'history',          label: 'History',   to: '/dashboard/history' },
  { icon: 'user-cog',         label: 'Profile',   to: '/dashboard/profile' },
];

export default function MobileNav({ role }) {
  const items = role === 'admin' ? adminItems
              : role === 'organizer' ? orgItems
              : userItems;

  return (
    <nav
      className="mobile-nav"
      style={{
        position:   'fixed',
        bottom:     0,
        left:       0,
        right:      0,
        height:     64,
        background: 'var(--surface)',
        borderTop:  '1px solid var(--border)',
        zIndex:     200,
        // display and alignItems are controlled by .mobile-nav CSS class
        // to avoid overriding the media-query show/hide behaviour
      }}
    >
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/admin' || item.to === '/organizer' || item.to === '/dashboard' || item.to === '/'}
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <i data-lucide={item.icon} style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 10, marginTop: 3, lineHeight: 1 }}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
