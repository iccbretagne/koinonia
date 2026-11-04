import { Ticket } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDateTime } from "@/components/ticketing/format";
import { listMyBookings } from "@/modules/ticketing";

/** Réservations liées au compte connecté (même email), sans passer par le lien personnel (spec 074). */
export default async function MyBookingsPage() {
  const session = await requireAuth();
  const bookings = await listMyBookings(session.user.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Billetterie" title="Mes réservations" description="Les réservations faites avec l'email de votre compte." />
      {bookings.length === 0 ? (
        <EmptyState icon={Ticket} title="Aucune réservation" description="Vos inscriptions aux événements apparaîtront ici." />
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <a href={b.manageUrl} className="block rounded-card border border-line bg-surface p-4 hover:border-brand">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{b.event.title}</p>
                  <StatusChip tone={b.status === "ACTIVE" ? "success" : "neutral"}>{b.status === "ACTIVE" ? "Active" : "Annulée"}</StatusChip>
                </div>
                <p className="text-[13px] text-ink-muted">
                  {formatDateTime(b.event.startsAt)} · {b.event.churchName}
                </p>
                <p className="text-[13px] text-ink">
                  {b.reference} · {b.participants} participant{b.participants > 1 ? "s" : ""}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
