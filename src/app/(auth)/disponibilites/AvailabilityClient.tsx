"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import AvailabilityTabs from "@/components/AvailabilityTabs";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Alert from "@/components/ui/Alert";
import ConfirmModal from "@/components/ui/ConfirmModal";
import StatusChip from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";
import UnavailabilityPeriodForm, { type BackupOption, type MemberRef, withdrawalSummary } from "@/components/UnavailabilityPeriodForm";

type Answer = "AVAILABLE" | "IF_NEEDED" | "UNAVAILABLE";
type State = Answer | "NO_RESPONSE" | "NOT_ASKED";

interface DeptState {
  departmentId: string;
  name: string;
  state: State;
  overdue: boolean;
  source: "response" | "period" | "asked" | "none";
  answer: Answer | null;
  enteredByThirdParty: boolean;
}

interface EventRow {
  id: string;
  title: string;
  date: string;
  dueAt: string | null;
  departments: DeptState[];
  /** Services où le STAR est planifié ; « Pas disponible » avant l'échéance vaut désistement (spec 061). */
  plannedIn?: { departmentId: string; departmentName: string; withdrawable: boolean }[];
}

type AnswerInput = { answer: Answer; departmentIds?: string[] };

/** Services planifiés qu'une réponse « Pas disponible » ferait quitter (désistement). */
function withdrawnBy(event: EventRow, answers: AnswerInput[]) {
  const planned = (event.plannedIn ?? []).filter((p) => p.withdrawable);
  return planned.filter((p) =>
    answers.some((a) => a.answer === "UNAVAILABLE" && (!a.departmentIds || a.departmentIds.includes(p.departmentId)))
  );
}

interface MonthRow {
  month: string;
  open: boolean;
  closesAt: string | null;
}

interface Payload {
  memberId: string;
  isSelf: boolean;
  months: MonthRow[];
  events: EventRow[];
}

const ANSWERS: { value: Answer; label: string; active: string }[] = [
  { value: "AVAILABLE", label: "Disponible", active: "bg-success text-on-brand border-success" },
  { value: "IF_NEEDED", label: "Si besoin", active: "bg-warning text-on-brand border-warning" },
  { value: "UNAVAILABLE", label: "Pas disponible", active: "bg-danger text-on-brand border-danger" },
];

const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

function monthLabel(key: string): string {
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Segmented({
  name,
  value,
  onChange,
}: {
  readonly name: string;
  readonly value: Answer | null;
  readonly onChange: (a: Answer) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-3 gap-2">
      {ANSWERS.map((a) => (
        <button
          key={a.value}
          type="button"
          role="radio"
          aria-checked={value === a.value}
          onClick={() => onChange(a.value)}
          className={`min-h-[44px] rounded-lg border px-2 text-sm font-medium transition-colors ${
            value === a.value ? a.active : "border-control-line bg-surface text-ink-muted hover:border-brand"
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function StateChip({ d, dueAt }: { readonly d: DeptState; readonly dueAt: string | null }) {
  if (d.state === "AVAILABLE") return <StatusChip tone="success">Disponible</StatusChip>;
  if (d.state === "IF_NEEDED") return <StatusChip tone="warning">Si besoin</StatusChip>;
  if (d.state === "UNAVAILABLE") {
    return <StatusChip tone="danger">{d.source === "period" ? "Pas disponible (période)" : "Pas disponible"}</StatusChip>;
  }
  if (d.state === "NO_RESPONSE") {
    const dueSuffix = dueAt ? ` · avant le ${shortFmt.format(new Date(dueAt))}` : "";
    const noResponseLabel = d.overdue ? "Sans réponse — en retard" : `Sans réponse${dueSuffix}`;
    return <StatusChip tone={d.overdue ? "danger" : "neutral"}>{noResponseLabel}</StatusChip>;
  }
  return <StatusChip tone="neutral">Non demandée</StatusChip>;
}

interface CardProps {
  readonly event: EventRow;
  readonly highlighted: boolean;
  readonly saving: boolean;
  readonly onSave: (event: EventRow, answers: { answer: Answer; departmentIds?: string[] }[]) => void;
}

function EventCard({ event, highlighted, saving, onSave }: CardProps) {
  const multi = event.departments.length >= 2;
  const initial = useMemo(() => {
    const map: Record<string, Answer | null> = {};
    for (const d of event.departments) map[d.departmentId] = d.answer;
    return map;
  }, [event.departments]);

  const [perDept, setPerDept] = useState(false);
  const [draft, setDraft] = useState<Record<string, Answer | null>>(initial);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  const values = event.departments.map((d) => draft[d.departmentId]);
  const uniform = values.every((v) => v === values[0]) ? values[0] : null;
  const dirty = event.departments.some((d) => draft[d.departmentId] !== d.answer);

  function setAll(a: Answer) {
    const next: Record<string, Answer | null> = {};
    for (const d of event.departments) next[d.departmentId] = a;
    setDraft(next);
  }

  function save() {
    if (!perDept || !multi) {
      if (uniform) onSave(event, [{ answer: uniform }]);
      return;
    }
    const byAnswer = new Map<Answer, string[]>();
    for (const d of event.departments) {
      const a = draft[d.departmentId];
      if (a) byAnswer.set(a, [...(byAnswer.get(a) ?? []), d.departmentId]);
    }
    onSave(event, Array.from(byAnswer.entries()).map(([answer, departmentIds]) => ({ answer, departmentIds })));
  }

  const thirdParty = event.departments.some((d) => d.enteredByThirdParty);
  const canSave = dirty && (perDept && multi ? values.some((v) => v !== null) : uniform !== null) && !saving;

  return (
    <div
      ref={ref}
      id={`event-${event.id}`}
      className={`rounded-xl border bg-surface p-4 space-y-3 ${highlighted ? "border-brand ring-2 ring-focus" : "border-line"}`}
    >
      <div>
        <h3 className="font-semibold text-ink break-words">{event.title}</h3>
        <p className="text-sm text-ink-muted first-letter:uppercase">{dateFmt.format(new Date(event.date))}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {event.departments.map((d) => (
          <span key={d.departmentId} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            {multi && <span>{d.name} :</span>}
            <StateChip d={d} dueAt={event.dueAt} />
          </span>
        ))}
      </div>

      {perDept && multi ? (
        <div className="space-y-3">
          {event.departments.map((d) => (
            <div key={d.departmentId} className="space-y-1">
              <p className="text-sm font-medium text-ink">{d.name}</p>
              <Segmented
                name={`${event.title} — ${d.name}`}
                value={draft[d.departmentId] ?? null}
                onChange={(a) => setDraft((prev) => ({ ...prev, [d.departmentId]: a }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <Segmented name={event.title} value={uniform} onChange={setAll} />
      )}

      {multi && (
        <Button variant="ghost" onClick={() => setPerDept((v) => !v)} className="-ml-4">
          {perDept ? "Même réponse pour tous mes départements" : "Préciser par département"}
        </Button>
      )}

      {thirdParty && <p className="text-xs text-ink-subtle">Réponse saisie par un responsable.</p>}

      <div className="flex justify-end">
        <Button onClick={save} disabled={!canSave}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

interface Props {
  readonly churchId: string;
  readonly selfMembers: MemberRef[];
  readonly manageableMembers: MemberRef[];
  readonly canDesignateBackup: boolean;
  readonly backupOptions: BackupOption[];
  readonly canSettings: boolean;
  readonly canViewOverview: boolean;
  readonly initialMonth: string | null;
  readonly focusEventId: string | null;
  readonly initialMemberId: string | null;
}

export default function AvailabilityClient({
  churchId,
  selfMembers,
  manageableMembers,
  canDesignateBackup,
  backupOptions,
  canSettings,
  canViewOverview,
  initialMonth,
  focusEventId,
  initialMemberId,
}: Props) {
  const toast = useToast();
  const [memberId, setMemberId] = useState(initialMemberId ?? selfMembers[0]?.id ?? "");
  const [now] = useState(Date.now);
  const [month, setMonth] = useState<string | null>(initialMonth);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ event: EventRow; answers: AnswerInput[] } | null>(null);
  const focusedRef = useRef(false);

  const isSelf = !memberId || selfMembers.some((m) => m.id === memberId);
  const allMembers = [...selfMembers, ...manageableMembers];
  const currentMember = allMembers.find((m) => m.id === memberId);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ churchId });
        if (month) params.set("month", month);
        if (memberId) params.set("memberId", memberId);
        const res = await fetch(`/api/availability?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Erreur lors du chargement");
        setData(json);
        if (!month && json.months?.length) setMonth(json.months[0].month.slice(0, 7));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    },
    [churchId, month, memberId]
  );

  useEffect(() => {
    if (selfMembers.length === 0 && manageableMembers.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
      setLoading(false);
      return;
    }
    void load();
  }, [load, selfMembers.length, manageableMembers.length]);

  // Quand un lien profond cible un événement d'un autre mois, on bascule sur son mois.
  useEffect(() => {
    if (!focusEventId || focusedRef.current || !data) return;
    if (data.events.some((e) => e.id === focusEventId)) focusedRef.current = true;
  }, [focusEventId, data]);

  /** Avertit avant un « Pas disponible » qui désisterait le STAR d'un service planifié (spec 061). */
  function requestSave(event: EventRow, answers: AnswerInput[]) {
    if (withdrawnBy(event, answers).length > 0) setPendingSave({ event, answers });
    else void save(event, answers);
  }

  async function save(event: EventRow, answers: AnswerInput[]) {
    setSavingId(event.id);
    try {
      const res = await fetch("/api/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          ...(memberId && !isSelf ? { memberId } : {}),
          answers: answers.map((a) => ({ eventId: event.id, ...a })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de l'enregistrement");
      toast.success("Disponibilité enregistrée");
      if (json.withdrawals > 0) toast.info("Désistement enregistré : votre responsable est prévenu pour vous remplacer.");
      if (json.alerts > 0) toast.info("La date limite de planification est passée : contactez directement votre responsable.");
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSavingId(null);
    }
  }

  if (selfMembers.length === 0 && manageableMembers.length === 0) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-bold text-ink">Mes disponibilités</h1>
        <Alert tone="info">
          Votre compte n&apos;est lié à aucune fiche STAR. Liez-le depuis <Link className="underline" href="/profile">votre profil</Link> pour indiquer vos disponibilités.
        </Alert>
      </div>
    );
  }

  const months = data?.months ?? [];
  const current = months.find((m) => m.month.slice(0, 7) === month);
  const events = data?.events ?? [];

  let eventsContent: ReactNode;
  if (loading) {
    eventsContent = <p className="text-sm text-ink-muted">Chargement…</p>;
  } else if (events.length === 0) {
    eventsContent = (
      <p className="text-sm text-ink-muted">Aucun événement à venir pour {month ? monthLabel(month) : "ce mois"} dans vos départements.</p>
    );
  } else {
    eventsContent = (
      <div className="space-y-4">
        {events.map((e) => (
          <EventCard
            key={`${e.id}:${e.departments.map((d) => d.answer ?? "-").join("")}`}
            event={e}
            highlighted={focusEventId === e.id}
            saving={savingId === e.id}
            onSave={requestSave}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <AvailabilityTabs self={selfMembers.length > 0} team={canViewOverview} collections={canSettings} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {isSelf ? "Mes disponibilités" : `Disponibilités de ${currentMember?.firstName} ${currentMember?.lastName}`}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Indiquez si vous pouvez servir. Votre responsable construit le planning à partir de vos réponses.
          </p>
        </div>
      </div>

      {manageableMembers.length > 0 && (
        <Select
          label="Répondre pour…"
          value={isSelf ? "" : memberId}
          onChange={(e) => setMemberId(e.target.value || (selfMembers[0]?.id ?? ""))}
          placeholder={selfMembers.length > 0 ? "Moi-même" : "Choisir un STAR"}
          options={manageableMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
        />
      )}

      {months.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Mois">
          {months.map((m) => {
            const key = m.month.slice(0, 7);
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === month}
                onClick={() => setMonth(key)}
                className={`shrink-0 min-h-[44px] rounded-full border px-4 text-sm ${
                  key === month ? "bg-brand text-on-brand border-brand" : "border-control-line text-ink-muted hover:border-brand"
                }`}
              >
                {monthLabel(key)}
              </button>
            );
          })}
        </div>
      )}

      {current?.closesAt && (
        <p className="text-sm text-ink-muted">
          {new Date(current.closesAt).getTime() > now
            ? `Réponses attendues avant le ${shortFmt.format(new Date(current.closesAt))}.`
            : "La date de réponse est passée : répondez au plus vite."}
        </p>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex">
        <Button variant="secondary" onClick={() => setPeriodOpen(true)}>
          Pas disponible du … au …
        </Button>
      </div>

      {eventsContent}

      <ConfirmModal
        open={pendingSave !== null}
        title="Ton responsable va devoir te remplacer"
        message={
          pendingSave
            ? `Tu es planifié(e) le ${shortFmt.format(new Date(pendingSave.event.date))} (${withdrawnBy(pendingSave.event, pendingSave.answers)
                .map((p) => p.departmentName)
                .join(", ")}) : répondre « Pas disponible » te retire de ce service, et ton responsable est prévenu tout de suite.`
            : ""
        }
        confirmLabel="Me désister"
        confirming={pendingSave !== null && savingId === pendingSave.event.id}
        onConfirm={async () => {
          if (!pendingSave) return;
          await save(pendingSave.event, pendingSave.answers);
          setPendingSave(null);
        }}
        onCancel={() => setPendingSave(null)}
      />

      <UnavailabilityPeriodForm
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        onSaved={(result) => {
          const summary = withdrawalSummary(result);
          toast.success(summary ? `Indisponibilité enregistrée · ${summary}` : "Indisponibilité enregistrée");
          void load(true);
        }}
        churchId={churchId}
        mode={isSelf ? "self" : "manage"}
        selfMembers={selfMembers}
        manageableMembers={manageableMembers}
        canDesignateBackup={canDesignateBackup}
        backupOptions={backupOptions}
        initialMemberId={memberId || undefined}
      />
    </div>
  );
}
