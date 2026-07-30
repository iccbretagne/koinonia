"use client";

interface TimelineAbsence {
  id: string;
  member: { id: string; firstName: string; lastName: string };
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "CANCELLED";
  hasConflict: boolean;
}

interface AbsencesTimelineProps {
  absences: TimelineAbsence[];
  onSelect?: (id: string) => void;
}

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

export default function AbsencesTimeline({ absences, onSelect }: AbsencesTimelineProps) {
  if (absences.length === 0) {
    return <p className="text-gray-500 text-sm py-6 text-center">Aucune absence à afficher.</p>;
  }

  const rangeStart = Math.min(...absences.map((a) => new Date(a.startDate).getTime()));
  const rangeEnd = Math.max(...absences.map((a) => new Date(a.endDate).getTime()));
  const rangeSpan = Math.max(rangeEnd - rangeStart, 1);

  const byMember = new Map<string, { name: string; absences: TimelineAbsence[] }>();
  for (const a of absences) {
    if (!byMember.has(a.member.id)) {
      byMember.set(a.member.id, { name: `${a.member.firstName} ${a.member.lastName}`, absences: [] });
    }
    byMember.get(a.member.id)!.absences.push(a);
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
                  {row.absences.map((a) => {
                    const left = ((new Date(a.startDate).getTime() - rangeStart) / rangeSpan) * 100;
                    const width = Math.max(
                      ((new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / rangeSpan) * 100,
                      1.5
                    );
                    const color =
                      a.status === "CANCELLED"
                        ? "bg-gray-300"
                        : a.hasConflict
                          ? "bg-orange-400"
                          : "bg-icc-violet";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelect?.(a.id)}
                        title={`${fmt.format(new Date(a.startDate))} → ${fmt.format(new Date(a.endDate))}`}
                        className={`absolute top-0.5 h-5 rounded ${color} hover:opacity-80 transition-opacity`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
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
