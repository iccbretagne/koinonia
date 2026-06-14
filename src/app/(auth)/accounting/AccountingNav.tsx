"use client";

import Link from "next/link";

export default function AccountingNav({
  canViewStats,
  active,
}: {
  canViewStats: boolean;
  active: "requests" | "stats";
}) {
  if (!canViewStats) return null;

  return (
    <div className="flex gap-1 border-b border-gray-200">
      <Link
        href="/accounting/requests"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "requests"
            ? "border-icc-violet text-icc-violet"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Demandes
      </Link>
      <Link
        href="/accounting/stats"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "stats"
            ? "border-icc-violet text-icc-violet"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Statistiques
      </Link>
    </div>
  );
}
