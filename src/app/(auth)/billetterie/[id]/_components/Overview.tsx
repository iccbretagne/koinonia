import CopyRow from "@/app/donner/_components/CopyRow";
import QrSvg from "@/components/ticketing/QrSvg";
import WhatsAppShare from "@/components/WhatsAppShare";
import type { BookingRow, EventDetail } from "@/modules/ticketing";
import { AGE_GROUP_LABEL, formatEuros } from "@/modules/ticketing/schemas";
import OpeningChecklist from "./OpeningChecklist";
import { readinessChecks } from "./readiness";

function Stat({ label, value, hint }: { readonly label: string; readonly value: string; readonly hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="text-[13px] text-ink-subtle">{hint}</p>}
    </div>
  );
}

/** Aperçu : places, recettes, inscrits par tarif, options par variante, lien public à partager. */
export default function Overview({
  event,
  bookings,
  publicUrl,
  publicQr,
  canConfigure = false,
}: {
  readonly canConfigure?: boolean;
  readonly event: EventDetail;
  readonly bookings: BookingRow[] | null;
  readonly publicUrl: string;
  readonly publicQr: { size: number; path: string };
}) {
  const remaining = Math.max(0, event.seatsOpen - event.seatsTaken);
  const totals = (bookings ?? []).reduce(
    (acc, b) => ({ paid: acc.paid + b.balances.paid, declared: acc.declared + b.balances.declared, due: acc.due + b.balances.due }),
    { paid: 0, declared: 0, due: 0 }
  );
  const byTariff = new Map<string, number>();
  for (const b of bookings ?? []) {
    for (const p of b.participants.filter((x) => x.status === "ACTIVE")) byTariff.set(p.ageGroup, (byTariff.get(p.ageGroup) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      {canConfigure && <OpeningChecklist eventId={event.id} status={event.status} checks={readinessChecks(event)} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Inscrits" value={`${event.seatsTaken} / ${event.seatsOpen}`} hint={`${remaining} place${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""} · jauge ${event.capacity}`} />
        {bookings && <Stat label="Encaissé" value={formatEuros(totals.paid)} hint={`Déclaré ${formatEuros(totals.declared)} · attendu ${formatEuros(totals.due)}`} />}
        {bookings && (
          <Stat
            label="Par tarif"
            value={String(event.seatsTaken)}
            hint={[...byTariff].map(([g, n]) => `${AGE_GROUP_LABEL[g as keyof typeof AGE_GROUP_LABEL]} ${n}`).join(" · ") || "—"}
          />
        )}
      </div>

      {event.options.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Options</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {event.options.map((o) => (
              <li key={o.id} className="px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-ink">
                    {o.label} {!o.active && <span className="text-ink-subtle">(désactivée)</span>}
                  </span>
                  <span className="text-ink">
                    {o.used}
                    {o.stock !== null ? ` / ${o.stock}` : ""}
                  </span>
                </div>
                {o.variants.length > 0 && (
                  <p className="text-[13px] text-ink-muted">{o.variants.map((v) => (v.stock === null ? `${v.label} ${v.used}` : `${v.label} ${v.used}/${v.stock}`)).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <h2 className="text-lg font-bold text-ink">Lien public</h2>
        {event.status === "DRAFT" && <p className="text-[13px] text-warning">Brouillon : la page publique sera visible une fois les inscriptions ouvertes.</p>}
        <CopyRow label="Adresse à partager (WhatsApp, affiche…)" display={publicUrl} value={publicUrl} />
        <div className="flex justify-end">
          <WhatsAppShare text={invitation(event, publicUrl)} copiedMessage="Invitation copiée" />
        </div>
        <div className="flex justify-center">
          <QrSvg qr={publicQr} label="QR code de la page d'inscription" className="size-48" />
        </div>
      </section>
    </div>
  );
}

/** Court message d'invitation à partager sur WhatsApp : titre, date, lieu, lien d'inscription. */
function invitation(event: EventDetail, publicUrl: string): string {
  const date = event.startsAt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const time = event.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const when = `📅 ${date} à ${time}${event.location ? `\n📍 ${event.location}` : ""}`;
  return `*${event.title}*\n${when}\n\nInscriptions : ${publicUrl}`;
}
