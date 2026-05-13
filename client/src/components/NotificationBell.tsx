import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notification } from '../../../shared/types';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/parent';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

function iconForType(type: Notification['type']): string {
  switch (type) {
    case 'achievement':
      return '\uD83C\uDFC6'; // trophy
    case 'reminder':
      return '\u23F0'; // alarm
    case 'parent_alert':
      return '\uD83D\uDEA8'; // siren
    case 'curriculum_nudge':
      return '\uD83D\uDCDA'; // books
    default:
      return '\uD83D\uDD14';
  }
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchNotifications(false);
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      /* ignore — silent refresh */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await markNotificationRead(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* ignore */
      }
    },
    []
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        type="button"
        className="notification-bell__button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <span className="notification-bell__icon">{'\uD83D\uDD14'}</span>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-bell__dropdown" role="menu">
          <div className="notification-bell__dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notification-bell__mark-all"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-bell__list">
            {loading && notifications.length === 0 && (
              <div className="notification-bell__empty">Loading\u2026</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="notification-bell__empty">
                No notifications yet.
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notification-item${n.read ? '' : ' notification-item--unread'}`}
                onClick={() => !n.read && handleMarkRead(n.id)}
              >
                <span className="notification-item__icon">
                  {iconForType(n.type)}
                </span>
                <div className="notification-item__content">
                  <div className="notification-item__title">{n.title}</div>
                  <div className="notification-item__message">{n.message}</div>
                  <div className="notification-item__time">
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
