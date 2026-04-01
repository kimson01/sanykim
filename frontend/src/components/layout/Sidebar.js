// src/components/layout/Sidebar.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SanyLogo from '../ui/Logo';

const adminNav = [
  { icon: 'layout-dashboard', label: 'Dashboard',    to: '/admin' },
  { icon: 'calendar',         label: 'All Events',   to: '/admin/events' },
  { icon: 'users',            label: 'Organizers',   to: '/admin/organizers' },
  { icon: 'user-check',       label: 'Users',        to: '/admin/users' },
  { icon: 'credit-card',      label: 'Transactions', to: '/admin/transactions' },
  { icon: 'scroll-text',      label: 'Logs',         to: '/admin/logs' },
  { icon: 'shield-alert',     label: 'Conflicts',    to: '/admin/conflicts' },
  { icon: 'wallet',            label: 'Payouts',      to: '/admin/payouts' },
  { icon: 'settings',         label: 'Settings',     to: '/admin/settings' },
];

const orgNav = [
  { icon: 'layout-dashboard', label: 'Dashboard',    to: '/organizer' },
  { icon: 'calendar',         label: 'My Events',    to: '/organizer/events' },
  { icon: 'users',            label: 'Attendees',    to: '/organizer/attendees' },
  { icon: 'scan-line',        label: 'Scan Tickets', to: '/organizer/scan' },
  { icon: 'bar-chart-2',      label: 'Analytics',    to: '/organizer/analytics' },
  { icon: 'shield-alert',     label: 'Conflicts',    to: '/organizer/conflicts' },
  { icon: 'wallet',            label: 'Earnings',     to: '/organizer/earnings' },
];

const userNav = [
  { icon: 'home',             label: 'Browse Events', to: '/' },
  { icon: 'layout-dashboard', label: 'Dashboard',     to: '/dashboard' },
  { icon: 'ticket',           label: 'My Tickets',    to: '/dashboard/tickets' },
  { icon: 'history',          label: 'History',       to: '/dashboard/history' },
  { icon: 'user-cog',         label: 'Profile',       to: '/dashboard/profile' },
  { icon: 'life-buoy',        label: 'Customer Care', to: '/customer-care' },
];

export default function Sidebar({ role }) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const nav        = role === 'admin' ? adminNav : role === 'organizer' ? orgNav : userNav;
  const roleLabel  = role === 'admin' ? 'Super Admin' : role === 'organizer' ? 'Organizer' : 'Attendee';
  const avatarClass = role === 'admin' ? 'avatar-orange' : role === 'organizer' ? 'avatar-blue' : 'avatar-green';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <SanyLogo size={32} full />
      </div>

      <div style={{ padding: '6px 20px 0', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          {roleLabel}
        </span>
      </div>

      <nav className="sidebar-nav">
        {nav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin' || item.to === '/organizer' || item.to === '/dashboard' || item.to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <i data-lucide={item.icon} style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div
          className="sidebar-user"
          onClick={() => { logout(); navigate('/'); }}
          title="Sign out"
        >
          <div className={`avatar ${avatarClass}`}>{user?.name?.[0] || 'U'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name?.split(' ')[0]}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Sign out</div>
          </div>
          <i data-lucide="log-out" style={{ width: 14, height: 14, color: 'var(--text3)' }} />
        </div>
      </div>
    </aside>
  );
}
