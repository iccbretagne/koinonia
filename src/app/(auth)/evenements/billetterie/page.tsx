import Link from "next/link";
import { Ticket } from "lucide-react";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip, buttonClasses } from "@/components/ui";
import { formatDateTime } from "@/components/ticketing/format";
import { countPendingDeclarations, isTicketingManager, listEvents } from "@/modules/ticketing";
import { ticketingTodoFromParam } from "@/lib/opening-params";
import { EVENT_STATUS_LABEL } from "@/modules/ticketing/schemas";
import CreateEventButton from "./CreateEventButton";
import { paths } from "@/lib/paths";

const STATUS_TONE = { DRAFT: "neutral", OPEN: "success", CLOSED: "warning", ARCHIVED: "neutral" } as const;

/**
 * Billetterie (spec 074) : événements de l'église, ou ceux où l'on a un rôle. `?a-traiter=reglements`
 * (spec 092, carte « À traiter » de l'Accueil) restreint la liste aux événements qui ont des
 * règlements déclarés à confirmer par la personne, chacun avec son nombre.
 */
export default async function TicketingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ "a-traiter"?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const manager = await isTicketingManager(session, churchId);
  const todo = ticketingTodoFromParam((await searchParams)["a-traiter"]);
  const [all, pending] = await Promise.all([
    listEvents(churchId, session.user.id, manager),
    todo ? countPendingDeclarations(session, churchId) : Promise.resolve(null),
  ]);
  const pendingOf = new Map((pending?.perEvent ?? []).map((p) => [p.eventId, p.count]));
  const events = todo ? all.filter((e) => pendingOf.has(e.id)) : all;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda"
        title="Billetterie"
        description="Inscriptions, paiements, billets et présences des événements ouverts au public."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={paths.events.mesInscriptions()} className={buttonClasses("secondary")}>
              Mes réservations
            </Link>
            {manager && <CreateEventButton />}
          </div>
        }
      />
      {todo && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-muted">
          Événements avec des règlements à confirmer.
          <Link href={paths.billetterie()} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline">
            Voir tous les événements
          </Link>
        </p>
      )}
      {events.length === 0 && todo ? (
        <EmptyState icon={Ticket} title="Aucun règlement à confirmer" description="Les déclarations « J'ai payé » de vos événements apparaîtront ici." />
      ) : events.length === 0 ? (
        <EmptyState icon={Ticket} title="Aucun événement" description={manager ? "Créez un premier événement de billetterie." : "Aucun événement ne vous est confié pour le moment."} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={todo ? paths.billetterie.event(e.id, { vue: "reglements" }) : paths.billetterie.event(e.id)} className="block rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{e.title}</p>
                  <StatusChip tone={STATUS_TONE[e.status]}>
                    {e.status === "OPEN" && e.seatsTaken >= e.seatsOpen ? "Complet" : EVENT_STATUS_LABEL[e.status]}
                  </StatusChip>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">{formatDateTime(e.startsAt)}</p>
                <p className="mt-2 text-[13px] text-ink">
                  {e.seatsTaken} / {e.seatsOpen} inscrits · jauge {e.capacity}
                </p>
                {pendingOf.has(e.id) && (
                  <p className="mt-2">
                    <StatusChip tone="warning">{pendingOf.get(e.id)} à confirmer</StatusChip>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
