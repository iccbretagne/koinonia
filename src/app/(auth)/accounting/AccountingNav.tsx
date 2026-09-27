"use client";

import Link from "next/link";

export default function AccountingNav({
  canViewStats,
  active,
}: {
  readonly canViewStats: boolean;
  readonly active: "requests" | "stats";
}) {
  if (!canViewStats) return null;

  return (
    <div className="flex gap-1 border-b border-line">
      <Link
        href="/accounting/requests"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "requests"
            ? "border-brand text-brand-text"
            : "border-transparent text-ink-muted hover:text-ink-muted"
        }`}
      >
        Demandes
      </Link>
      <Link
        href="/accounting/stats"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "stats"
            ? "border-brand text-brand-text"
            : "border-transparent text-ink-muted hover:text-ink-muted"
        }`}
      >
        Statistiques
      </Link>
    </div>
  );
}
