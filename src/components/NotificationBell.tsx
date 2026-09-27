"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import BottomSheet from "@/components/ui/BottomSheet";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function NotificationRow({ notif, onClose }: { readonly notif: NotificationItem; readonly onClose: () => void }) {
  const inner = (
    <div
      className={`flex gap-3 border-b border-line px-4 py-3 transition-colors duration-120 last:border-0 hover:bg-surface-sunken ${
        notif.read ? "" : "bg-brand-soft/60"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-2 size-2 shrink-0 rounded-full ${notif.read ? "bg-transparent" : "bg-brand"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-5 text-ink">
            {!notif.read && <span className="sr-only">Non lue : </span>}
            {notif.title}
          </p>
          <span className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-subtle">{formatTime(notif.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{notif.message}</p>
      </div>
    </div>
  );

  if (notif.link) {
    return (
      <Link href={notif.link} onClick={onClose} className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
        {inner}
      </Link>
    );
  }
  return inner;
}

/**
 * Notifications de la barre supérieure : `IconButton` avec compteur (`CountBadge`), menu déroulant
 * sur desktop, feuille du bas (`BottomSheet`) sous 768px. Sondage toutes les 60 s.
 */
export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // `null` fermé ; sinon la présentation choisie à l'ouverture selon la largeur d'écran.
  const [open, setOpen] = useState<null | "dropdown" | "sheet">(null);
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

  useEffect(() => {
    if (open !== "dropdown") return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(null);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
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

  const close = () => setOpen(null);

  const list =
    notifications.length === 0 ? (
      <p className="px-4 py-8 text-center text-sm text-ink-muted">Aucune notification pour le moment.</p>
    ) : (
      notifications.map((notif) => <NotificationRow key={notif.id} notif={notif} onClose={close} />)
    );

  const markAll = unreadCount > 0 && (
    <button
      type="button"
      onClick={markAllRead}
      className="min-h-9 cursor-pointer rounded-control px-2 font-display text-[13px] font-semibold text-brand-text hover:bg-surface-sunken"
    >
      Tout marquer comme lu
    </button>
  );

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Notifications";

  return (
    <div data-tour="header-notifications" className="relative" ref={dropdownRef}>
      <IconButton
        icon={Bell}
        aria-label={label}
        badge={unreadCount}
        aria-expanded={open !== null}
        onClick={() => setOpen((o) => (o ? null : window.innerWidth < 768 ? "sheet" : "dropdown"))}
      />

      {open === "dropdown" && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-card border border-line bg-surface shadow-float">
          <div className="flex items-center justify-between gap-2 border-b border-line py-2 pl-4 pr-2">
            <h2 className="font-display text-[15px] font-semibold leading-5 text-ink">Notifications</h2>
            {markAll}
          </div>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto overscroll-contain">{list}</div>
        </div>
      )}

      <BottomSheet open={open === "sheet"} onClose={close} title="Notifications">
        {markAll && <div className="-mt-1 mb-2 flex justify-end">{markAll}</div>}
        <div className="-mx-4 border-t border-line">{list}</div>
      </BottomSheet>
    </div>
  );
}
