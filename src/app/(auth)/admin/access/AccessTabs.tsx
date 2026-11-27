"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui";
import { paths } from "@/lib/paths";

type Tab = "personnes" | "roles" | "demandes";

interface Props {
  readonly peopleTab: ReactNode;
  readonly rolesTab: ReactNode;
  readonly requestsTab: ReactNode;
  readonly requestCount: number;
}

const TAB_LABELS: Record<Tab, string> = {
  personnes: "Personnes",
  roles: "Par rôle",
  demandes: "Demandes",
};

const TAB_ORDER: Tab[] = ["personnes", "roles", "demandes"];

/**
 * Onglets de l'écran des accès (docs/design-system/components/Tabs.md) : des liens `?onglet=`,
 * pour qu'un lien partagé ou un retour arrière retrouve la même vue. Sans paramètre, les demandes
 * en attente s'ouvrent d'abord.
 */
export default function AccessTabs({ peopleTab, rolesTab, requestsTab, requestCount }: Props) {
  const requested = useSearchParams().get("onglet");
  const tab: Tab = TAB_ORDER.find((t) => t === requested) ?? (requestCount > 0 ? "demandes" : "personnes");

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        ariaLabel="Vues des accès"
        tabs={TAB_ORDER.map((t) => ({
          href: paths.admin.access({ onglet: t }),
          label: TAB_LABELS[t],
          active: t === tab,
          count: t === "demandes" && requestCount > 0 ? requestCount : undefined,
        }))}
      />

      <div className={tab === "personnes" ? "" : "hidden"}>{peopleTab}</div>
      <div className={tab === "roles" ? "" : "hidden"}>{rolesTab}</div>
      <div className={tab === "demandes" ? "" : "hidden"}>{requestsTab}</div>
    </div>
  );
}
