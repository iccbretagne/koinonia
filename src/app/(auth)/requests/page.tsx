import { requireAuth, getCurrentChurchId, requireChurchAccess, requireChurchPermission } from "@/lib/auth";
import { rolePermissions, registry } from "@/lib/registry";
import Link from "next/link";
import { Bus, CalendarHeart, Church, ClipboardList, Plus, Ticket, Wallet } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import RequestsList from "./RequestsList";
import { loadMyRequests } from "./my-requests-data";
import { appointmentStatus } from "./request-display";
import { listMyRequests, REJECT_REASON_LABELS } from "@/modules/care";
import { isShuttleVisible } from "@/modules/shuttle/auth";
import { paths } from "@/lib/paths";

const SECTION_TITLE = "font-display text-[17px] font-semibold leading-6 text-ink";

/** Nombres de réservations et de réponses du compte (Mes inscriptions) : un échec vaut zéro. */
async function myRegistrationCounts(userId: string) {
  const [reservations, responses] = await Promise.all([
    registry.has("ticketing")
      ? import("@/modules/ticketing").then(({ countMyBookings }) => countMyBookings(userId)).catch(() => 0)
      : 0,
    registry.has("forms")
      ? import("@/modules/forms").then(({ countMemberResponses }) => countMemberResponses(userId)).catch(() => 0)
      : 0,
  ]);
  return { reservations, responses };
}

/**
 * « Mes demandes » (spec 092, exception 1) : ouverte à tout compte de l'église (rôle ou profil
 * pastoral), en consultation. Chaque section ne lit que ce qui appartient au compte connecté
 * (`submittedById` / `userId`) dans l'église courante. Créer, modifier ou annuler une demande
 * interne reste réservé à `members:view`, comme `/requests/new` et `/api/requests`.
 */
export default async function MyRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
  await requireChurchAccess(churchId);

  // Même garde que `POST /api/requests` (profil pastoral compris) : jamais de bouton vers un refus.
  const canCreate = await requireChurchPermission("members:view", churchId).then(() => true, () => false);

  // Les demandes comptables ont leur propre écran (spec 043) : on n'en duplique pas un extrait ici.
  // Le Ministre et le Resp. département (accounting:view sans accounting:manage) n'ont plus d'entrée
  // de menu comptable (spec 092, lot 1) : cette section leur donne la lecture de leur portée et la
  // création, sans rien ouvrir de plus que ce que les écrans vérifient déjà.
  const churchPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  const canSubmitAccounting = churchPermissions.has("accounting:submit");
  const showAccountingSection =
    registry.has("accounting") &&
    (canSubmitAccounting || churchPermissions.has("accounting:view") || isPastoral);

  const [decoratedRequests, appointmentRequests, questionnaires, registrations, hasShuttle] = await Promise.all([
    loadMyRequests(session.user.id, churchId),
    registry.has("care") ? listMyRequests(session.user.id!, churchId) : [],
    registry.has("campaigns")
      ? import("@/modules/campaigns")
          .then(({ listMyOpenAssignments }) => listMyOpenAssignments(session, churchId))
          .then((list) => (Array.isArray(list) ? list.length : 0))
          .catch(() => 0)
      : 0,
    myRegistrationCounts(session.user.id!),
    isShuttleVisible(session, churchId).catch(() => false),
  ]);
  const registrationCount = registrations.reservations + registrations.responses;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mes demandes"
        description={
          canCreate
            ? "Annonces, visuels et demandes que vous avez envoyés, et leur avancement."
            : "Vos demandes de rendez-vous, questionnaires et inscriptions, et leur avancement."
        }
        actions={
          canCreate && (
            <Link href={paths.requests.newRequest()} className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Nouvelle demande
            </Link>
          )
        }
      />

      {showAccountingSection && (
        <section aria-labelledby="accounting-title" className="flex flex-col gap-3">
          <h2 id="accounting-title" className={SECTION_TITLE}>
            Demandes comptables
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link href={paths.accounting.requests()} className={buttonClasses("secondary")}>
              <Wallet aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Voir les demandes comptables
            </Link>
            {canSubmitAccounting && (
              <Link href={paths.accounting.newRequest()} className={buttonClasses("secondary")}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Nouvelle demande comptable
              </Link>
            )}
          </div>
        </section>
      )}

      {hasShuttle && (
        <section aria-labelledby="shuttle-title" className="flex flex-col gap-3">
          <h2 id="shuttle-title" className={SECTION_TITLE}>
            Navette
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link href={paths.accounting.navette()} className={buttonClasses("secondary")}>
              <Bus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Ouvrir le registre de la navette
            </Link>
          </div>
        </section>
      )}

      {registry.has("care") && (
        <section aria-labelledby="appointments-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="appointments-title" className={SECTION_TITLE}>
              Rendez-vous pastoraux
            </h2>
            <Link href={paths.care.request({ new: "1" })} className={buttonClasses("secondary", "sm")}>
              <CalendarHeart aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Demander un rendez-vous
            </Link>
          </div>
          {appointmentRequests.length > 0 && (
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
          )}
        </section>
      )}

      {questionnaires > 0 && (
        <section aria-labelledby="questionnaires-title" className="flex flex-col gap-3">
          <h2 id="questionnaires-title" className={SECTION_TITLE}>
            Questionnaires à remplir
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link href={paths.collectes()} className={buttonClasses("secondary")}>
              <ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {questionnaires > 1 ? `${questionnaires} questionnaires` : "1 questionnaire"}
            </Link>
          </div>
        </section>
      )}

      {registrationCount > 0 && (
        <section aria-labelledby="registrations-title" className="flex flex-col gap-3">
          <h2 id="registrations-title" className={SECTION_TITLE}>
            Mes inscriptions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={registrations.reservations > 0 ? paths.billetterie.mesReservations() : paths.formulaires.mesReponses()}
              className={buttonClasses("secondary")}
            >
              <Ticket aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {registrationCount > 1 ? `${registrationCount} inscriptions` : "1 inscription"}
            </Link>
          </div>
        </section>
      )}

      <RequestsList requests={decoratedRequests} canCreate={canCreate} />
    </div>
  );
}
