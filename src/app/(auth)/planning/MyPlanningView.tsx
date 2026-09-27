"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarX2, CircleDashed, MapPin, Users } from "lucide-react";
import DateTile from "@/components/DateTile";
import PeriodNav from "@/components/PeriodNav";
import EmptyState from "@/components/ui/EmptyState";
import StatusChip from "@/components/ui/StatusChip";
import { serviceStatusDescriptor } from "@/components/ui/status";

type PlanningEntry = {
  id: string;
  status: string | null;
  eventDepartment: {
    event: {
      id: string;
      title: string;
      type: string;
      date: Date | string;
    };
    department: {
      id: string;
      name: string;
    };
  };
};

type TeamEventEntry = {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  location: string | null;
  department: { id: string; name: string };
};

interface Props {
  readonly plannings: PlanningEntry[];
  readonly tasksByEvent?: Record<string, string[]>;
  readonly teamEvents?: TeamEventEntry[];
}

function formatTimeRange(start: Date | string, end: Date | string) {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return `${s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}

function formatLongDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatMonthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function monthKeyOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function MyPlanningView({ plannings, tasksByEvent = {}, teamEvents = [] }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  const hasAny = plannings.length > 0 || teamEvents.length > 0;

  const { minKey, maxKey } = useMemo(() => {
    if (!hasAny) return { minKey: currentMonthKey(), maxKey: currentMonthKey() };
    const keys = [
      ...plannings.map((p) => monthKeyOf(p.eventDepartment.event.date)),
      ...teamEvents.map((t) => monthKeyOf(t.startsAt)),
    ].sort((a, b) => a.localeCompare(b));
    // Extend range to include current month
    const cur = currentMonthKey();
    return {
      minKey: keys[0] < cur ? keys[0] : cur,
      maxKey: keys[keys.length - 1] > cur ? keys[keys.length - 1] : cur,
    };
  }, [plannings, teamEvents, hasAny]);

  const entries = useMemo(
    () => plannings.filter((p) => monthKeyOf(p.eventDepartment.event.date) === selectedMonth)
             .sort((a, b) => new Date(a.eventDepartment.event.date).getTime() - new Date(b.eventDepartment.event.date).getTime()),
    [plannings, selectedMonth]
  );

  const monthTeamEvents = useMemo(
    () => teamEvents.filter((t) => monthKeyOf(t.startsAt) === selectedMonth)
             .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [teamEvents, selectedMonth]
  );

  const { year, month } = parseMonthKey(selectedMonth);
  const canPrev = selectedMonth > minKey;
  const canNext = selectedMonth < maxKey;

  // Prochain service, tous mois confondus : la carte « prochain service » des maquettes.
  const nextService = useMemo(() => {
    const now = new Date().getTime();
    return [...plannings]
      .filter((p) => new Date(p.eventDepartment.event.date).getTime() >= now)
      .sort((a, b) => new Date(a.eventDepartment.event.date).getTime() - new Date(b.eventDepartment.event.date).getTime())[0];
  }, [plannings]);

  // Services et événements d'équipe du mois, dans l'ordre chronologique.
  const rows = useMemo(
    () =>
      [
        ...monthTeamEvents.map((t) => ({ kind: "team" as const, date: new Date(t.startsAt), team: t })),
        ...entries.map((p) => ({ kind: "service" as const, date: new Date(p.eventDepartment.event.date), planning: p })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [monthTeamEvents, entries]
  );

  if (!hasAny) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={CalendarCheck}
          title="Aucun service ni événement d'équipe"
          description="Votre responsable de département vous assignera à des événements."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {nextService && (
        <NextServiceCard planning={nextService} tasks={tasksByEvent[`${nextService.eventDepartment.event.id}_${nextService.eventDepartment.department.id}`] ?? []} />
      )}

      <section aria-label="Mes services du mois" className="flex flex-col gap-4">
        <PeriodNav
          label={formatMonthLabel(year, month)}
          prev={{ onClick: () => setSelectedMonth((k) => addMonths(k, -1)), disabled: !canPrev }}
          next={{ onClick: () => setSelectedMonth((k) => addMonths(k, 1)), disabled: !canNext }}
          prevLabel="Mois précédent"
          nextLabel="Mois suivant"
        />

        {rows.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={CalendarX2}
              title="Rien de prévu ce mois-ci"
              description="Vous n'avez ni service ni événement d'équipe sur ce mois."
              size="sm"
            />
          </div>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {rows.map((row) => {
              const isPast = row.date < new Date();
              if (row.kind === "team") {
                const t = row.team;
                return (
                  <li key={`team-${t.id}`} className={`flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 ${isPast ? "opacity-60" : ""}`}>
                    <DateTile date={t.startsAt} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{t.title}</p>
                      <p className="text-[13px] leading-[18px] text-ink-muted">
                        {formatTimeRange(t.startsAt, t.endsAt)} · {t.department.name}
                      </p>
                      {t.location && (
                        <p className="inline-flex items-center gap-1 text-[13px] leading-[18px] text-ink-muted">
                          <MapPin aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                          {t.location}
                        </p>
                      )}
                    </div>
                    <StatusChip tone="neutral" icon={Users} className="shrink-0">
                      Équipe
                    </StatusChip>
                  </li>
                );
              }
              const p = row.planning;
              const event = p.eventDepartment.event;
              const dept = p.eventDepartment.department;
              const tasks = tasksByEvent[`${event.id}_${dept.id}`] ?? [];
              const descriptor = serviceStatusDescriptor(p.status);
              return (
                <li key={p.id} className={`flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 ${isPast ? "opacity-60" : ""}`}>
                  <DateTile date={event.date} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{event.title}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {formatTime(event.date)} · {dept.name}
                    </p>
                    {tasks.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tasks.map((task) => (
                          <span key={task} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold leading-4 text-brand-text">
                            {task}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {descriptor ? (
                    <StatusChip tone={descriptor.tone} icon={descriptor.icon} className="shrink-0">
                      <span className="hidden sm:inline">{descriptor.label}</span>
                      <span className="sm:hidden">{descriptor.tone === "brand" ? "Debrief" : descriptor.label}</span>
                    </StatusChip>
                  ) : (
                    <StatusChip tone="neutral" icon={CircleDashed} className="shrink-0">
                      Pas en service
                    </StatusChip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Carte « prochain service » (maquette mobile) : aplat `brand`, texte `on-brand`. */
export function NextServiceCard({ planning, tasks }: { readonly planning: PlanningEntry; readonly tasks: string[] }) {
  const event = planning.eventDepartment.event;
  const dept = planning.eventDepartment.department;
  const descriptor = serviceStatusDescriptor(planning.status);
  return (
    <section aria-labelledby="next-service-title" className="flex flex-col gap-3 rounded-card bg-brand p-4 text-on-brand shadow-card">
      <p className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-on-brand/80">Prochain service</p>
      <div className="flex items-center gap-3">
        <DateTile date={event.date} onBrand />
        <div className="min-w-0">
          <h2 id="next-service-title" className="font-display text-[17px] font-semibold leading-[22px]">
            {event.title}
          </h2>
          <p className="text-sm leading-5 text-on-brand/90 first-letter:uppercase">
            {formatLongDate(event.date)} · {formatTime(event.date)} · {dept.name}
            {tasks.length > 0 && ` · ${tasks.join(", ")}`}
          </p>
        </div>
      </div>
      {descriptor && (
        <span className="w-fit rounded-chip bg-surface">
          <StatusChip tone={descriptor.tone} icon={descriptor.icon}>
            {descriptor.label}
          </StatusChip>
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/events/${event.id}/star-view`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control bg-surface px-4 font-display text-sm font-semibold text-brand-text transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-brand sm:flex-none"
        >
          Voir l&apos;équipe
        </Link>
        <Link
          href="/absences"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-on-brand/50 px-4 font-display text-sm font-semibold text-on-brand transition-colors hover:bg-on-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-brand sm:flex-none"
        >
          Je ne peux pas
        </Link>
      </div>
    </section>
  );
}
