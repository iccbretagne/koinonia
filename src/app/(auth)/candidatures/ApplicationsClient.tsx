"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { DataTable, EmptyState, StatusChip, Tabs } from "@/components/ui";
import type { ApplicationSummary } from "@/modules/serving";
import { APPLICATION_STATUS_LABEL } from "@/modules/serving/schemas";
import AssignmentChip, { formatDay } from "./AssignmentChip";

export type ApplicationsTab = "todo" | "ongoing" | "departments" | "archived";

const TAB_LABEL: Record<ApplicationsTab, string> = {
  todo: "À traiter",
  ongoing: "En cours",
  departments: "Mes départements",
  archived: "Archivées",
};

const EMPTY: Record<ApplicationsTab, string> = {
  todo: "Aucune candidature à traiter.",
  ongoing: "Aucune personne en attente d'accueil ou en observation.",
  departments: "Aucune personne orientée vers tes départements.",
  archived: "Aucune candidature archivée.",
};

interface Props {
  readonly tab: ApplicationsTab;
  readonly tabs: readonly ApplicationsTab[];
  readonly pvs: ApplicationSummary[];
  readonly departments: ApplicationSummary[];
}

export default function ApplicationsClient({ tab, tabs, pvs, departments }: Props) {
  const rows =
    tab === "departments"
      ? departments
      : pvs.filter((a) => a.bucket === (tab === "todo" ? "todo" : tab === "ongoing" ? "ongoing" : "archived"));
  const counts: Partial<Record<ApplicationsTab, number>> = {
    todo: pvs.filter((a) => a.bucket === "todo").length,
  };

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <Tabs
          ariaLabel="Candidatures"
          tabs={tabs.map((t) => ({
            href: `/candidatures?onglet=${t}`,
            label: TAB_LABEL[t],
            count: counts[t] || undefined,
            active: t === tab,
          }))}
        />
      )}
      <DataTable
        data={rows}
        emptyState={<EmptyState icon={Inbox} size="sm" title={EMPTY[tab]} />}
        columns={[
          {
            header: "Candidat",
            primary: true,
            accessor: (a) =>
              a.canOpen ? (
                <Link href={`/candidatures/${a.id}`} className="font-medium text-ink hover:text-brand-text underline-offset-2 hover:underline">
                  {a.firstName} {a.lastName}
                </Link>
              ) : (
                <span className="font-medium text-ink-muted">
                  {a.firstName} {a.lastName}
                </span>
              ),
          },
          { header: "Reçue le", accessor: (a) => formatDay(a.createdAt), hideOnMobile: true },
          {
            header: "Étape",
            accessor: (a) => (
              <div className="flex flex-wrap gap-1">
                {a.assignments.length === 0 ? (
                  <StatusChip tone={a.status === "REJECTED" ? "neutral" : "info"}>
                    {APPLICATION_STATUS_LABEL[a.status]}
                  </StatusChip>
                ) : (
                  <>
                    {a.status === "REJECTED" && <StatusChip>{APPLICATION_STATUS_LABEL.REJECTED}</StatusChip>}
                    {a.assignments.map((s) => (
                      <AssignmentChip
                        key={s.id}
                        departmentName={s.departmentName}
                        status={s.status}
                        observationEndsAt={s.observationEndsAt}
                        overdue={s.overdue}
                      />
                    ))}
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
