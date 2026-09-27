import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions, registry } from "@/lib/registry";
import Link from "next/link";
import { CalendarHeart, Church, Plus, Wallet } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import RequestsList from "./RequestsList";
import { loadMyRequests } from "./my-requests-data";
import { appointmentStatus } from "./request-display";
import { listMyRequests, REJECT_REASON_LABELS } from "@/modules/care";

export default async function MyRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
  await requireChurchPermission("members:view", churchId);

  // Les demandes comptables ont leur propre espace (spec 043) : on n'en duplique plus un extrait
  // ici, un lien en tête de page y renvoie.
  const churchPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  const showAccountingLink =
    registry.has("accounting") &&
    (churchPermissions.has("accounting:submit") || isPastoral);

  const decoratedRequests = await loadMyRequests(session.user.id, churchId);

  const appointmentRequests = registry.has("care")
    ? await listMyRequests(session.user.id!, churchId)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mes demandes"
        description="Annonces, visuels et demandes que vous avez envoyés, et leur avancement."
        actions={
          <>
            {showAccountingLink && (
              <Link href="/accounting/requests" className={buttonClasses("secondary")}>
                <Wallet aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Demandes comptables
              </Link>
            )}
            <Link href="/requests/new" className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Nouvelle demande
            </Link>
          </>
        }
      />

      {appointmentRequests.length > 0 && (
        <section aria-labelledby="appointments-title" className="flex flex-col gap-3">
          <h2 id="appointments-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
            Rendez-vous pastoraux
          </h2>
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {appointmentRequests.map((r) => {
              const status = appointmentStatus(r.status);
              return (
                <li key={r.id} className="flex min-h-16 items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
                    <CalendarHeart aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{r.subject}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {new Date(r.scheduledFor ?? r.createdAt).toLocaleDateString("fr-FR")}
                      {r.status === "REJECTED" && r.rejectReasonCode && (
                        <> · {REJECT_REASON_LABELS[r.rejectReasonCode] ?? r.rejectReasonCode}</>
                      )}
                    </p>
                  </div>
                  <StatusChip tone={status.tone} className="shrink-0">{status.label}</StatusChip>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <RequestsList requests={decoratedRequests} />
    </div>
  );
}
