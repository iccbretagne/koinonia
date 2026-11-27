import Link from "next/link";
import type { Session } from "next-auth";
import { ChevronRight, ClipboardList, Plus, Upload } from "lucide-react";
import { getCurrentChurchId } from "@/lib/auth";
import { hasCampaignsManage } from "@/modules/campaigns/auth";
import { listMyCampaigns } from "@/modules/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/modules/campaigns/schemas";
import EmptyState from "@/components/ui/EmptyState";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import { CAMPAIGN_STATUS_TONES, formatDay, percent } from "./display";
import { paths } from "@/lib/paths";

/**
 * Campagnes que je pilote dans l'église courante (spec 090) : titre, état, échéance, avancement.
 * Les boutons « Nouvelle campagne » et « Importer » n'apparaissent qu'avec `campaigns:manage` dans cette église. Rien n'est rendu si
 * je ne pilote aucune campagne et ne peux pas en créer.
 */
export default async function ManagedCampaigns({
  session,
  toValidate = false,
}: {
  readonly session: Session;
  /** `?a-valider=1` (spec 092) : seulement les campagnes qui ont des contributions soumises à valider. */
  readonly toValidate?: boolean;
}) {
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return null;
  const [{ managed }, canCreate] = await Promise.all([listMyCampaigns(session), hasCampaignsManage(session, churchId)]);
  const campaigns = managed.filter((c) => c.churchId === churchId && (!toValidate || c.assignments.submitted > 0));
  if (toValidate) {
    return (
      <section aria-labelledby="managed-campaigns" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="managed-campaigns" className="font-display text-[17px] font-semibold leading-6 text-ink">
            Contributions à valider
          </h2>
          <Link href={paths.collectes()} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-text underline-offset-2 hover:underline">
            Voir toutes les campagnes
          </Link>
        </div>
        {campaigns.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState icon={ClipboardList} title="Rien à valider" description="Les contributions soumises de vos campagnes apparaîtront ici." size="sm" />
          </div>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {campaigns.map((c) => (
              <li key={c.id} className="border-t border-line first:border-t-0">
                <Link
                  href={paths.collectes.campaign(c.id, { onglet: "suivi", etat: "soumis" })}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-[22px] text-ink">{c.title}</p>
                  <StatusChip tone="warning" className="shrink-0">
                    {c.assignments.submitted} à valider
                  </StatusChip>
                  <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-ink-subtle sm:block" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  if (campaigns.length === 0 && !canCreate) return null;

  const actions = canCreate ? (
    <div className="flex flex-wrap gap-2">
      <Link href={paths.collectes.nouvelle()} className={buttonClasses("primary")}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Nouvelle campagne
      </Link>
      <Link href={paths.collectes.importNew()} className={buttonClasses("secondary")}>
        <Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Importer
      </Link>
    </div>
  ) : null;

  return (
    <section aria-labelledby="managed-campaigns" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="managed-campaigns" className="font-display text-[17px] font-semibold leading-6 text-ink">
          Campagnes que je pilote
        </h2>
        {campaigns.length > 0 && actions}
      </div>
      {campaigns.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={ClipboardList}
            title="Aucune campagne"
            description="Composez une campagne avec l'éditeur ou importez sa définition pour préparer ses questionnaires."
            action={actions}
            size="sm"
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {campaigns.map((c) => {
            const done = c.assignments.submitted + c.assignments.validated;
            const rate = c.assignments.total ? done / c.assignments.total : 0;
            return (
              <li key={c.id} className="border-t border-line first:border-t-0">
                <Link
                  href={paths.collectes.campaign(c.id)}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{c.title}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      Échéance {formatDay(c.dueAt)} · {done}/{c.assignments.total} rendus ({percent(rate)})
                    </p>
                    <div
                      className="mt-2 h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-surface-sunken"
                      role="progressbar"
                      aria-label="Avancement"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(rate * 100)}
                    >
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(rate * 100)}%` }} />
                    </div>
                  </div>
                  <StatusChip tone={CAMPAIGN_STATUS_TONES[c.status]} className="shrink-0">
                    {CAMPAIGN_STATUS_LABELS[c.status]}
                  </StatusChip>
                  <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-ink-subtle sm:block" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
