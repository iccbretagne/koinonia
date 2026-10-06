"use client";

interface TimelineAbsence {
  id: string;
  member: { id: string; firstName: string; lastName: string };
  kind: "PERIOD" | "EVENTS";
  startDate: string | null;
  endDate: string | null;
  targetEvents: { date: string; deleted: boolean }[];
  status: "ACTIVE" | "CANCELLED";
  hasConflict: boolean;
}

interface TimelineResponse {
  id: string;
  member: { id: string; firstName: string; lastName: string };
  event: { title: string; date: string };
}

interface AbsencesTimelineProps {
  readonly absences: TimelineAbsence[];
  /** Réponses « Pas disponible » (spec 058) : un repère par événement. */
  readonly responses?: TimelineResponse[];
  readonly onSelect?: (id: string) => void;
}

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

/** Bornes d'affichage : période déclarée, ou dates des événements visés encore existants. */
function absenceBarColor(a: TimelineAbsence): string {
  if (a.status === "CANCELLED") return "bg-control-line";
  if (a.hasConflict) return "bg-warning";
  return "bg-brand";
}

function displayRange(a: TimelineAbsence): { start: number; end: number } | null {
  if (a.kind === "PERIOD") {
    if (!a.startDate || !a.endDate) return null;
    return { start: new Date(a.startDate).getTime(), end: new Date(a.endDate).getTime() };
  }
  const live = a.targetEvents.filter((e) => !e.deleted).map((e) => new Date(e.date).getTime());
  if (live.length === 0) return null;
  return { start: Math.min(...live), end: Math.max(...live) };
}

export default function AbsencesTimeline({ absences, responses = [], onSelect }: AbsencesTimelineProps) {
  const withRange = absences
    .map((a) => ({ a, range: displayRange(a) }))
    .filter((r): r is { a: TimelineAbsence; range: { start: number; end: number } } => r.range !== null);

  if (withRange.length === 0 && responses.length === 0) {
    return <p className="text-ink-muted text-sm py-6 text-center">Aucune indisponibilité à afficher.</p>;
  }

  const allStarts = [...withRange.map((r) => r.range.start), ...responses.map((r) => new Date(r.event.date).getTime())];
  const allEnds = [...withRange.map((r) => r.range.end), ...responses.map((r) => new Date(r.event.date).getTime())];
  const rangeStart = Math.min(...allStarts);
  const rangeEnd = Math.max(...allEnds);
  const rangeSpan = Math.max(rangeEnd - rangeStart, 1);

  const byMember = new Map<
    string,
    { name: string; items: { a: TimelineAbsence; range: { start: number; end: number } }[]; responses: TimelineResponse[] }
  >();
  for (const item of withRange) {
    const { a } = item;
    if (!byMember.has(a.member.id)) {
      byMember.set(a.member.id, { name: `${a.member.firstName} ${a.member.lastName}`, items: [], responses: [] });
    }
    byMember.get(a.member.id)!.items.push(item);
  }
  for (const r of responses) {
    if (!byMember.has(r.member.id)) {
      byMember.set(r.member.id, { name: `${r.member.firstName} ${r.member.lastName}`, items: [], responses: [] });
    }
    byMember.get(r.member.id)!.responses.push(r);
  }
  const rows = Array.from(byMember.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="flex justify-between px-3 py-1.5 text-xs text-ink-subtle border-b border-line">
            <span>{fmt.format(new Date(rangeStart))}</span>
            <span>{fmt.format(new Date(rangeEnd))}</span>
          </div>
          <div className="divide-y divide-line">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center gap-3 px-3 py-2">
                <div className="w-32 shrink-0 text-sm text-ink-muted truncate">{row.name}</div>
                <div className="relative flex-1 h-6 bg-surface-sunken rounded">
                  {row.items.map(({ a, range }) => {
                    const color = absenceBarColor(a);
                    const title = `${fmt.format(new Date(range.start))} → ${fmt.format(new Date(range.end))}`;

                    if (a.kind === "PERIOD") {
                      const left = ((range.start - rangeStart) / rangeSpan) * 100;
                      const width = Math.max(((range.end - range.start) / rangeSpan) * 100, 1.5);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onSelect?.(a.id)}
                          title={title}
                          className={`absolute top-0.5 h-5 rounded ${color} hover:opacity-80 transition-opacity`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      );
                    }

                    return (
                      <span key={a.id}>
                        {a.targetEvents
                          .filter((e) => !e.deleted)
                          .map((e, i) => {
                            const pos = ((new Date(e.date).getTime() - rangeStart) / rangeSpan) * 100;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => onSelect?.(a.id)}
                                title={fmt.format(new Date(e.date))}
                                className={`absolute top-0.5 h-5 w-2 rounded-full ${color} hover:opacity-80 transition-opacity`}
                                style={{ left: `${pos}%` }}
                              />
                            );
                          })}
                      </span>
                    );
                  })}
                  {row.responses.map((r) => (
                    <span
                      key={r.id}
                      title={`${r.event.title} — ${fmt.format(new Date(r.event.date))}`}
                      className="absolute top-0.5 h-5 w-2 rounded-full bg-danger"
                      style={{ left: `${((new Date(r.event.date).getTime() - rangeStart) / rangeSpan) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
