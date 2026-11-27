"use client";

import { Tabs } from "@/components/ui";

type Tab = "requests" | "stats" | "navette" | "tresorerie";

/**
 * Onglets de l'espace Comptabilité : Demandes, Statistiques, Navette quand le registre de la
 * navette est visible (spec 073), Trésorerie pour la compta (spec 076). Rien n'est affiché s'il
 * n'y a qu'un onglet.
 */
export default function AccountingNav({
  canViewStats,
  canViewShuttle = false,
  canViewRequests = true,
  canViewTreasury = false,
  active,
}: {
  readonly canViewStats: boolean;
  readonly canViewShuttle?: boolean;
  readonly canViewRequests?: boolean;
  readonly canViewTreasury?: boolean;
  readonly active: Tab;
}) {
  const tabs: { key: Tab; href: string; label: string }[] = [
    ...(canViewRequests ? [{ key: "requests" as const, href: "/accounting/requests", label: "Demandes" }] : []),
    ...(canViewStats ? [{ key: "stats" as const, href: "/accounting/stats", label: "Statistiques" }] : []),
    ...(canViewShuttle ? [{ key: "navette" as const, href: "/accounting/navette", label: "Navette" }] : []),
    ...(canViewTreasury ? [{ key: "tresorerie" as const, href: "/accounting/tresorerie", label: "Trésorerie" }] : []),
  ];
  if (tabs.length < 2) return null;

  return (
    <Tabs
      ariaLabel="Espace Comptabilité"
      tabs={tabs.map((tab) => ({ href: tab.href, label: tab.label, active: active === tab.key }))}
    />
  );
}
