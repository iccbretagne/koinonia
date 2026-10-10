"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarX2, CircleDashed, MapPin, UserMinus, Users } from "lucide-react";
import DateTile from "@/components/DateTile";
import PeriodNav from "@/components/PeriodNav";
import EmptyState from "@/components/ui/EmptyState";
import StatusChip from "@/components/ui/StatusChip";
import { serviceStatusDescriptor } from "@/components/ui/status";
import { CancelWithdrawalButton, DeadlinePassedNotice, WithdrawButton, type LeaderContact } from "./WithdrawalActions";

type PlanningEntry = {
  id: string;
  status: string | null;
  /** Le STAR peut encore se désister lui-même (avant la date limite de planification, spec 061). */
  withdrawable?: boolean;
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

/** Service quitté par un désistement, en attente de remplacement (spec 061). */
type WithdrawalEntry = {
  id: string;
  event: { id: string; title: string; date: Date | string };
  department: { id: string; name: string };
};

interface Props {
  readonly plannings: PlanningEntry[];
  readonly tasksByEvent?: Record<string, string[]>;
  readonly teamEvents?: TeamEventEntry[];
  readonly withdrawals?: WithdrawalEntry[];
  /** Responsables à joindre, par département, une fois la date limite passée. */
  readonly contactsByDepartment?: Record<string, LeaderContact[]>;
}

const OPENING_CLOSING_DEPARTMENT = "opening-closing";

/** Action « Je ne peux plus » d'un service à venir, ou le message après la date limite. */
function ServiceWithdrawalAction({
  planning,
  contacts,
  onBrand = false,
}: {
  readonly planning: PlanningEntry;
  readonly contacts: LeaderContact[];
  readonly onBrand?: boolean;
}) {
  const { event, department } = planning.eventDepartment;
  if (department.id === OPENING_CLOSING_DEPARTMENT) return null;
  if (planning.withdrawable) {
    return (
      <WithdrawButton
        eventId={event.id}
        departmentId={department.id}
        eventTitle={event.title}
        eventDate={event.date}
        departmentName={department.name}
        onBrand={onBrand}
      />
    );
  }
  return <DeadlinePassedNotice contacts={contacts} />;
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

export default function MyPlanningView({
  plannings,
  tasksByEvent = {},
  teamEvents = [],
  withdrawals = [],
  contactsByDepartment = {},
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  const hasAny = plannings.length > 0 || teamEvents.length > 0 || withdrawals.length > 0;

  const { minKey, maxKey } = useMemo(() => {
    if (!hasAny) return { minKey: currentMonthKey(), maxKey: currentMonthKey() };
    const keys = [
      ...plannings.map((p) => monthKeyOf(p.eventDepartment.event.date)),
      ...teamEvents.map((t) => monthKeyOf(t.startsAt)),
      ...withdrawals.map((w) => monthKeyOf(w.event.date)),
    ].sort((a, b) => a.localeCompare(b));
    // Extend range to include current month
    const cur = currentMonthKey();
    const lastKey = keys.at(-1) ?? cur;
    return {
      minKey: keys[0] < cur ? keys[0] : cur,
      maxKey: lastKey > cur ? lastKey : cur,
    };
  }, [plannings, teamEvents, withdrawals, hasAny]);

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
        ...withdrawals
          .filter((w) => monthKeyOf(w.event.date) === selectedMonth)
          .map((w) => ({ kind: "withdrawn" as const, date: new Date(w.event.date), withdrawal: w })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [monthTeamEvents, entries, withdrawals, selectedMonth]
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
        <NextServiceCard
          planning={nextService}
          tasks={tasksByEvent[`${nextService.eventDepartment.event.id}_${nextService.eventDepartment.department.id}`] ?? []}
          contacts={contactsByDepartment[nextService.eventDepartment.department.id] ?? []}
        />
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
                  <li key={`team-${t.id}`} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <DateTile date={t.startsAt} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[15px] font-semibold leading-[22px] ${isPast ? "text-ink-subtle" : "text-ink"}`}>{t.title}</p>
                      <p className="text-[13px] leading-[18px] text-ink-muted">
                        {formatTimeRange(t.startsAt, t.endsAt)} · {t.department.name}
                        {isPast && <span className="text-ink-subtle"> · Passé</span>}
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
              if (row.kind === "withdrawn") {
                const w = row.withdrawal;
                return (
                  <li key={`withdrawal-${w.id}`} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
                    <div className="flex items-center gap-3">
                      <DateTile date={w.event.date} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold leading-[22px] text-ink-subtle line-through">{w.event.title}</p>
                        <p className="text-[13px] leading-[18px] text-ink-muted">
                          {formatTime(w.event.date)} · {w.department.name}
                        </p>
                      </div>
                      <StatusChip tone="warning" icon={UserMinus} className="shrink-0">
                        <span className="hidden sm:inline">Désisté — en attente de remplacement</span>
                        <span className="sm:hidden">Désisté</span>
                      </StatusChip>
                    </div>
                    {!isPast && (
                      <div className="flex justify-end">
                        <CancelWithdrawalButton withdrawalId={w.id} eventDate={w.event.date} />
                      </div>
                    )}
                  </li>
                );
              }
              const p = row.planning;
              const event = p.eventDepartment.event;
              const dept = p.eventDepartment.department;
              const tasks = tasksByEvent[`${event.id}_${dept.id}`] ?? [];
              const descriptor = serviceStatusDescriptor(p.status);
              const isNext = nextService?.id === p.id;
              return (
                <li key={p.id} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="flex items-center gap-3">
                    <DateTile date={event.date} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[15px] font-semibold leading-[22px] ${isPast ? "text-ink-subtle" : "text-ink"}`}>{event.title}</p>
                      <p className="text-[13px] leading-[18px] text-ink-muted">
                        {formatTime(event.date)} · {dept.name}
                        {isPast && <span className="text-ink-subtle"> · Passé</span>}
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
                  </div>
                  {!isPast && !isNext && (
                    <div className={p.withdrawable ? "flex justify-end empty:hidden" : "empty:hidden"}>
                      <ServiceWithdrawalAction planning={p} contacts={contactsByDepartment[dept.id] ?? []} />
                    </div>
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
export function NextServiceCard({
  planning,
  tasks,
  contacts = [],
}: {
  readonly planning: PlanningEntry;
  readonly tasks: string[];
  readonly contacts?: LeaderContact[];
}) {
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
        {planning.withdrawable && <ServiceWithdrawalAction planning={planning} contacts={contacts} onBrand />}
      </div>
      {!planning.withdrawable && <ServiceWithdrawalAction planning={planning} contacts={contacts} />}
    </section>
  );
}
