import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { qrPath } from "@/lib/qr";
import QrSvg from "@/components/ticketing/QrSvg";
import { canDo, getEventAccess, getEventDetail, listTeam } from "@/modules/ticketing";
import PrintButton from "./PrintButton";

/** Badges de l'équipe à imprimer (spec 074, lot 2) : nom, poste et QR, 8 par page A4. */
export default async function BadgesPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  const access = await getEventAccess(session, id).catch(() => null);
  if (!access) notFound();
  if (!canDo(access, "configure")) return <p className="p-4 text-ink-muted">Réservé à l&apos;organisation.</p>;
  const [event, team] = await Promise.all([getEventDetail(id), listTeam(id)]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-bold text-ink">Badges — {event.title}</h1>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-3 print:gap-0">
        {team.assignments.map((a) => (
          <div key={a.id} className="flex break-inside-avoid items-center gap-3 rounded-card border border-line bg-surface p-3 print:h-[68mm] print:rounded-none">
            <QrSvg qr={qrPath(a.badge)} label={`Badge de ${a.name}`} className="size-28 shrink-0" />
            <div>
              <p className="text-lg font-bold text-ink">{a.name}</p>
              <p className="text-[13px] text-ink-muted">{a.postName ?? "Équipe"}</p>
              <p className="text-[13px] text-ink-muted">{event.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
