"use client";

import Link from "next/link";

type Tab = "requests" | "stats" | "navette";

/**
 * Onglets de l'espace Comptabilité : Demandes, Statistiques et, quand le registre de la navette
 * est visible (spec 073), Navette. Rien n'est affiché s'il n'y a qu'un onglet.
 */
export default function AccountingNav({
  canViewStats,
  canViewShuttle = false,
  canViewRequests = true,
  active,
}: {
  readonly canViewStats: boolean;
  readonly canViewShuttle?: boolean;
  readonly canViewRequests?: boolean;
  readonly active: Tab;
}) {
  const tabs: { key: Tab; href: string; label: string }[] = [
    ...(canViewRequests ? [{ key: "requests" as const, href: "/accounting/requests", label: "Demandes" }] : []),
    ...(canViewStats ? [{ key: "stats" as const, href: "/accounting/stats", label: "Statistiques" }] : []),
    ...(canViewShuttle ? [{ key: "navette" as const, href: "/accounting/navette", label: "Navette" }] : []),
  ];
  if (tabs.length < 2) return null;

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === tab.key
              ? "border-brand text-brand-text"
              : "border-transparent text-ink-muted hover:text-ink-muted"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
