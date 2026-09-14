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

interface AbsencesTimelineProps {
  readonly absences: TimelineAbsence[];
  readonly onSelect?: (id: string) => void;
}

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

/** Bornes d'affichage : période déclarée, ou dates des événements visés encore existants. */
function displayRange(a: TimelineAbsence): { start: number; end: number } | null {
  if (a.kind === "PERIOD") {
    if (!a.startDate || !a.endDate) return null;
    return { start: new Date(a.startDate).getTime(), end: new Date(a.endDate).getTime() };
  }
  const live = a.targetEvents.filter((e) => !e.deleted).map((e) => new Date(e.date).getTime());
  if (live.length === 0) return null;
  return { start: Math.min(...live), end: Math.max(...live) };
}

export default function AbsencesTimeline({ absences, onSelect }: AbsencesTimelineProps) {
  const withRange = absences
    .map((a) => ({ a, range: displayRange(a) }))
    .filter((r): r is { a: TimelineAbsence; range: { start: number; end: number } } => r.range !== null);

  if (withRange.length === 0) {
    return <p className="text-gray-500 text-sm py-6 text-center">Aucune absence à afficher.</p>;
  }

  const rangeStart = Math.min(...withRange.map((r) => r.range.start));
  const rangeEnd = Math.max(...withRange.map((r) => r.range.end));
  const rangeSpan = Math.max(rangeEnd - rangeStart, 1);

  const byMember = new Map<string, { name: string; items: { a: TimelineAbsence; range: { start: number; end: number } }[] }>();
  for (const item of withRange) {
    const { a } = item;
    if (!byMember.has(a.member.id)) {
      byMember.set(a.member.id, { name: `${a.member.firstName} ${a.member.lastName}`, items: [] });
    }
    byMember.get(a.member.id)!.items.push(item);
  }
  const rows = Array.from(byMember.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="flex justify-between px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
            <span>{fmt.format(new Date(rangeStart))}</span>
            <span>{fmt.format(new Date(rangeEnd))}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center gap-3 px-3 py-2">
                <div className="w-32 shrink-0 text-sm text-gray-700 truncate">{row.name}</div>
                <div className="relative flex-1 h-6 bg-gray-50 rounded">
                  {row.items.map(({ a, range }) => {
                    const color =
                      a.status === "CANCELLED"
                        ? "bg-gray-300"
                        : a.hasConflict
                          ? "bg-orange-400"
                          : "bg-icc-violet";
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
