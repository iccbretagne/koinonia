import { registry } from "@/lib/registry";
import { qrPath } from "@/lib/qr";
import QrSvg from "@/components/ticketing/QrSvg";
import { formatDateTime } from "@/components/ticketing/format";

/**
 * Affectations à l'équipe d'événements de billetterie (spec 074, lot 2) : poste, horaires et
 * badge personnel. Lecture seule ; le planning des départements n'est pas touché. Absent si le
 * module est désactivé.
 */
export default async function TicketingAssignments({ userId }: { readonly userId: string }) {
  if (!registry.has("ticketing")) return null;
  const { listAssignmentsForUser } = await import("@/modules/ticketing");
  const assignments = await listAssignmentsForUser(userId).catch(() => []);
  if (assignments.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Événements">
      <h2 className="text-lg font-bold text-ink">Événements</h2>
      {assignments.map((a) => (
        <div key={a.id} className="space-y-2 rounded-card border border-line bg-surface p-4">
          <p className="font-semibold text-ink">{a.event.title}</p>
          <p className="text-[13px] text-ink-muted">
            {a.postName ?? "Équipe"} · {formatDateTime(a.startsAt ?? a.event.startsAt)}
            {a.endsAt ? ` → ${formatDateTime(a.endsAt)}` : ""}
            {a.event.location ? ` · ${a.event.location}` : ""}
          </p>
          <details>
            <summary className="cursor-pointer text-[15px] font-semibold text-brand-text">Afficher mon badge</summary>
            <div className="flex justify-center pt-3">
              <QrSvg qr={qrPath(a.badge)} label={`Badge — ${a.event.title}`} className="size-56" />
            </div>
          </details>
        </div>
      ))}
    </section>
  );
}
