import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { listMyAssignments } from "@/modules/campaigns";
import { ASSIGNMENT_STATUS_LABELS } from "@/modules/campaigns/schemas";
import { ASSIGNMENT_STATUS_TONES } from "./_components/display";
import ManagedCampaigns from "./_components/ManagedCampaigns";
import { paths } from "@/lib/paths";
import { isOpenFlag } from "@/lib/opening-params";

export const metadata: Metadata = { title: "Questionnaires" };

const dayFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

const isPast = (d: Date) => d.getTime() < Date.now();

/** Collectes (spec 090) : campagnes que je pilote, puis questionnaires qui me sont confiés. */
export default async function CampaignsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ "a-valider"?: string }>;
}) {
  const session = await requireAuth();
  const toValidate = isOpenFlag((await searchParams)["a-valider"]);
  const assignments = await listMyAssignments(session);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader title="Questionnaires" description="Collectes de données de l'église : questionnaires à remplir et campagnes à piloter." />

      <ManagedCampaigns session={session} toValidate={toValidate} />

      <section aria-labelledby="mes-questionnaires" className="flex flex-col gap-3">
        <h2 id="mes-questionnaires" className="font-display text-[17px] font-semibold leading-6 text-ink">
          Mes questionnaires
        </h2>
        {assignments.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={ClipboardList}
              title="Aucun questionnaire à remplir"
              description="Quand une collecte vous confie un questionnaire, il apparaît ici et vous êtes prévenu."
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.map((a) => {
              const open = a.campaignStatus === "OPEN";
              const toDo = open && ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(a.status);
              const overdue = toDo && a.dueAt !== null && isPast(a.dueAt);
              return (
                <li key={a.id}>
                  <Link
                    href={paths.collectes.reponse(a.id)}
                    className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink-muted">{a.campaignTitle}</p>
                      <p className="font-semibold text-ink">{a.formTitle}</p>
                      <p className="text-[15px] text-ink-muted">{a.label}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StatusChip tone={ASSIGNMENT_STATUS_TONES[a.status]}>{ASSIGNMENT_STATUS_LABELS[a.status]}</StatusChip>
                        {!open && <StatusChip tone="neutral">Campagne clôturée</StatusChip>}
                        {a.dueAt && toDo && (
                          <span className={`text-[13px] ${overdue ? "font-semibold text-danger" : "text-ink-muted"}`}>
                            {overdue ? "Échéance dépassée : " : "À rendre le "}
                            {dayFr(a.dueAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
