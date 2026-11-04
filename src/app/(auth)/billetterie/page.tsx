import Link from "next/link";
import { Ticket } from "lucide-react";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDateTime } from "@/components/ticketing/format";
import { isTicketingManager, listEvents } from "@/modules/ticketing";
import { EVENT_STATUS_LABEL } from "@/modules/ticketing/schemas";
import CreateEventButton from "./CreateEventButton";

const STATUS_TONE = { DRAFT: "neutral", OPEN: "success", CLOSED: "warning", ARCHIVED: "neutral" } as const;

/** Billetterie (spec 074) : événements de l'église, ou ceux où l'on a un rôle. */
export default async function TicketingPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const manager = await isTicketingManager(session, churchId);
  const events = await listEvents(churchId, session.user.id, manager);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda"
        title="Billetterie"
        description="Inscriptions, paiements, billets et présences des événements ouverts au public."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/billetterie/mes-reservations" className="self-center text-[15px] font-semibold text-brand-text underline">
              Mes réservations
            </Link>
            {manager && <CreateEventButton />}
          </div>
        }
      />
      {events.length === 0 ? (
        <EmptyState icon={Ticket} title="Aucun événement" description={manager ? "Créez un premier événement de billetterie." : "Aucun événement ne vous est confié pour le moment."} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/billetterie/${e.id}`} className="block rounded-card border border-line bg-surface p-4 hover:border-brand">
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
