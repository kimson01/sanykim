import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../api/client';
import { useToast } from '../ui';

const timeAgo = (value) => {
  const ts = value ? new Date(value).getTime() : 0;
  if (!ts) return '';
  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
};

export default function NotificationMenu() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await notificationsAPI.list({ limit: 8 });
      setItems(Array.isArray(res.data?.data) ? res.data.data : []);
      setUnreadCount(Number(res.data?.meta?.unread_count || 0));
    } catch (_) {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const openMenu = async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadNotifications();
  };

  const handleOpenItem = async (item) => {
    try {
      if (!item.is_read) {
        await notificationsAPI.read(item.id);
        setItems((current) => current.map((entry) => (
          entry.id === item.id ? { ...entry, is_read: true } : entry
        )));
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch (_) {}

    setOpen(false);
    if (item.link_url) navigate(item.link_url);
  };

  const handleReadAll = async () => {
    setMarkingAll(true);
    try {
      await notificationsAPI.readAll();
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to update notifications', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className={`notification-menu ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        onClick={openMenu}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <i data-lucide="bell" style={{ width: 16, height: 16 }} />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 99)}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <div>
              <strong>Notifications</strong>
              <small>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</small>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleReadAll}
              disabled={markingAll || unreadCount === 0}
            >
              Mark all read
            </button>
          </div>

          <div className="notification-list">
            {loading && items.length === 0 ? (
              <div className="notification-empty">Loading notifications…</div>
            ) : items.length === 0 ? (
              <div className="notification-empty">No notifications yet.</div>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-item ${item.is_read ? '' : 'unread'}`}
                onClick={() => handleOpenItem(item)}
              >
                <div className="notification-item-head">
                  <strong>{item.title}</strong>
                  <span>{timeAgo(item.created_at)}</span>
                </div>
                <p>{item.message}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
