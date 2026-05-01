"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function NotificationRow({ notif, formatTime, onClose }: {
  notif: NotificationItem;
  formatTime: (iso: string) => string;
  onClose: () => void;
}) {
  const inner = (
    <div
      className={`px-4 py-3 border-b last:border-0 hover:bg-gray-50 active:bg-gray-100 ${
        !notif.read ? "bg-blue-50/50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">
          {!notif.read && (
            <span className="inline-block w-2 h-2 rounded-full bg-icc-violet mr-1.5 shrink-0" />
          )}
          {notif.title}
        </p>
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
          {formatTime(notif.createdAt)}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{notif.message}</p>
    </div>
  );

  if (notif.link) {
    return (
      <Link key={notif.id} href={notif.link} onClick={onClose}>
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close desktop dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  function formatTime(iso: string) {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  }

  const close = () => setOpen(false);

  return (
    <div data-tour="header-notifications" className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-icc-rouge rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Desktop dropdown ─────────────────────────────────────────────────── */}
      {open && (
        <div className="hidden md:block absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-icc-violet hover:underline">
                Tout marquer comme lu
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">Aucune notification</p>
            ) : (
              notifications.map((notif) => (
                <NotificationRow key={notif.id} notif={notif} formatTime={formatTime} onClose={close} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Mobile bottom sheet ──────────────────────────────────────────────── */}
      {open && (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[75dvh]">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-sm text-icc-violet hover:underline">
                    Tout marquer comme lu
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Fermer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* List */}
            <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              {notifications.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">Aucune notification</p>
              ) : (
                notifications.map((notif) => (
                  <NotificationRow key={notif.id} notif={notif} formatTime={formatTime} onClose={close} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
