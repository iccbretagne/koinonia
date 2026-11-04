import { Download } from "lucide-react";
import { capacityTone } from "@/components/ticketing/format";
import type { PresenceView } from "@/modules/ticketing";

/** Présences : compteur par catégorie, jauge, mineurs non accompagnés présents, anomalies, courbe. */
export default function PresenceTab({ eventId, presence, canExport }: { readonly eventId: string; readonly presence: PresenceView; readonly canExport: boolean }) {
  const { counts, capacity, level } = presence;
  const max = Math.max(capacity, ...presence.curve.map((c) => c.total), 1);
  return (
    <div className="space-y-6">
      <div className={`rounded-card p-4 ${capacityTone(level)}`}>
        <p className="text-[13px] text-ink-muted">Présents</p>
        <p className="text-4xl font-bold text-ink">
          {counts.total} <span className="text-xl text-ink-muted">/ {capacity}</span>
        </p>
        <p className="text-[15px] text-ink">
          Participants {counts.participants} (dont mineurs {counts.minors}) · Équipe et intervenants {counts.staff} · Comptage manuel {counts.manual >= 0 ? "+" : ""}
          {counts.manual}
        </p>
      </div>
      {presence.unaccompanied.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Mineurs non accompagnés présents</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {presence.unaccompanied.map((m) => (
              <li key={m.id} className="px-4 py-3 text-[15px] text-ink">
                {m.name} — responsable : {m.guardian} {m.phone}
              </li>
            ))}
          </ul>
        </section>
      )}
      {presence.anomalies > 0 && (
        <p className="text-[15px] text-warning">
          {presence.anomalies} passage{presence.anomalies > 1 ? "s" : ""} incohérent{presence.anomalies > 1 ? "s" : ""} (détail dans le registre).
        </p>
      )}
      {presence.curve.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Évolution</h2>
          <ol className="space-y-1">
            {presence.curve.map((c) => (
              <li key={c.at} className="flex items-center gap-2 text-[13px] text-ink-muted">
                <span className="w-12 shrink-0">{new Date(c.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="h-3 rounded-chip bg-brand" style={{ width: `${(c.total / max) * 100}%` }} aria-hidden="true" />
                <span className="text-ink">{c.total}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {canExport && (
        <a className="inline-flex items-center gap-1 text-[15px] font-semibold text-brand-text underline" href={`/api/ticketing/events/${eventId}/export?type=passages`}>
          <Download className="size-4" aria-hidden="true" /> Registre des entrées et sorties
        </a>
      )}
    </div>
  );
}
