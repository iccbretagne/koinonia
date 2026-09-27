"use client";

import { useSearchParams } from "next/navigation";
import { CalendarDays, CalendarRange, ChartColumn, ClipboardList, ListChecks, Users, type LucideIcon } from "lucide-react";
import Tabs, { type TabItem } from "@/components/ui/Tabs";

const VIEWS: { view: string; label: string; icon: LucideIcon }[] = [
  { view: "event", label: "Saisie", icon: ClipboardList },
  { view: "week", label: "Semaine", icon: CalendarRange },
  { view: "month", label: "Mois", icon: CalendarDays },
  { view: "tasks", label: "Tâches", icon: ListChecks },
  { view: "team", label: "Équipe", icon: Users },
];

function TabLabel({ icon: Icon, label }: { readonly icon: LucideIcon; readonly label: string }) {
  return (
    <>
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      {label}
    </>
  );
}

/**
 * Vues du planning d'un département (saisie, semaine, mois, tâches, équipe, statistiques) :
 * onglets de navigation (`Tabs`), la vue active vit dans l'URL (`?view=`).
 */
export default function DashboardActions() {
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "event";
  const dept = searchParams.get("dept");

  function buildHref(view: string) {
    const params = new URLSearchParams();
    if (dept) params.set("dept", dept);
    params.set("view", view);
    return `/dashboard?${params.toString()}`;
  }

  const tabs: TabItem[] = [
    ...VIEWS.map(({ view, label, icon }) => ({
      href: buildHref(view),
      label: <TabLabel icon={icon} label={label} />,
      active: currentView === view,
    })),
    {
      href: dept ? `/dashboard/stats?dept=${dept}` : "/dashboard/stats",
      label: <TabLabel icon={ChartColumn} label="Statistiques" />,
      active: false,
    },
  ];

  return (
    <div data-tour="dashboard-actions">
      <Tabs tabs={tabs} ariaLabel="Vues du planning" />
    </div>
  );
}
