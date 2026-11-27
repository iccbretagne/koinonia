"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { CalendarPlus, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Alert, Button, ConfirmModal, EmptyState, IconButton, Input, Modal, Select, StatusChip, buttonClasses, fieldLabelClasses } from "@/components/ui";
import Checkbox from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import type { SlotView } from "@/modules/serving";
import { DEFAULT_INTERVIEW_MINUTES } from "@/modules/serving/schemas";

type Slot = Omit<SlotView, "startsAt"> & { startsAt: string };
type Interviewer = { id: string; name: string };

const TZ = "Europe/Paris";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: TZ });
const timeKey = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
/** Pastille de choix (radio masquée) : 44 px, focus visible porté par l'étiquette. */
function choiceClasses(on: boolean): string {
  return `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
    on ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
  }`;
}

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Jours AAAA-MM-JJ entre deux dates incluses, limités aux jours de la semaine choisis (0 = lundi). */
export function expandDays(from: string, to: string, weekdays: readonly number[]): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(`${from}T12:00:00Z`); d <= end && out.length < 62; d.setUTCDate(d.getUTCDate() + 1)) {
    if (weekdays.includes((d.getUTCDay() + 6) % 7)) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

type FormState = {
  mode: "one" | "series";
  day: string;
  time: string;
  dayFrom: string;
  dayTo: string;
  weekdays: number[];
  from: string;
  to: string;
  duration: string;
  interviewerId: string;
  place: "location" | "visio";
  location: string;
  visioUrl: string;
};

function SlotForm({
  initial,
  interviewers,
  editing,
  busy,
  onSubmit,
}: {
  readonly initial: FormState;
  readonly interviewers: readonly Interviewer[];
  readonly editing: boolean;
  readonly busy: boolean;
  readonly onSubmit: (f: FormState) => void;
}) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const seriesDays = f.mode === "series" && f.dayFrom && f.dayTo ? expandDays(f.dayFrom, f.dayTo, f.weekdays) : [];
  function submit(e: SubmitEvent) {
    e.preventDefault();
    onSubmit(f);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {!editing && (
        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Type d&apos;ajout</legend>
          <div className="flex flex-wrap gap-2">
            {(["one", "series"] as const).map((m) => (
              <label key={m} className={choiceClasses(f.mode === m)}>
                <input type="radio" name="mode" value={m} checked={f.mode === m} onChange={() => set("mode", m)} className="sr-only" />
                {m === "one" ? "Un créneau" : "Une série"}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {f.mode === "one" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Jour" type="date" required value={f.day} onChange={(e) => set("day", e.target.value)} />
          <Input label="Heure" type="time" required value={f.time} onChange={(e) => set("time", e.target.value)} />
          <Input label="Durée (min)" type="number" min={5} max={240} required value={f.duration} onChange={(e) => set("duration", e.target.value)} />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Du" type="date" required value={f.dayFrom} onChange={(e) => set("dayFrom", e.target.value)} />
            <Input label="Au" type="date" required value={f.dayTo} onChange={(e) => set("dayTo", e.target.value)} />
          </div>
          <fieldset className="space-y-2">
            <legend className={fieldLabelClasses}>Jours de la semaine</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {WEEKDAYS.map((w, i) => (
                <label key={w} className="flex min-h-11 items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={f.weekdays.includes(i)}
                    onChange={(e) => set("weekdays", e.target.checked ? [...f.weekdays, i] : f.weekdays.filter((x) => x !== i))}
                  />
                  {w}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="De" type="time" required value={f.from} onChange={(e) => set("from", e.target.value)} />
            <Input label="À" type="time" required value={f.to} onChange={(e) => set("to", e.target.value)} />
            <Input label="Durée de chaque créneau (min)" type="number" min={5} max={240} required value={f.duration} onChange={(e) => set("duration", e.target.value)} />
          </div>
          <p className="text-sm text-ink-muted">
            {seriesDays.length} jour{seriesDays.length > 1 ? "s" : ""} retenu{seriesDays.length > 1 ? "s" : ""} ; chaque créneau reste modifiable seul ensuite.
          </p>
        </>
      )}
      <Select
        label="Personne qui reçoit"
        required
        value={f.interviewerId}
        onChange={(e) => set("interviewerId", e.target.value)}
        placeholder="Choisir…"
        options={interviewers.map((i) => ({ value: i.id, label: i.name }))}
      />
      <fieldset className="space-y-2">
        <legend className={`${fieldLabelClasses} mb-2`}>Où</legend>
        <div className="flex flex-wrap gap-2">
          {(["location", "visio"] as const).map((p) => (
            <label key={p} className={choiceClasses(f.place === p)}>
              <input type="radio" name="place" value={p} checked={f.place === p} onChange={() => set("place", p)} className="sr-only" />
              {p === "location" ? "Sur place" : "En visio"}
            </label>
          ))}
        </div>
        {f.place === "location" ? (
          <Input label="Lieu (facultatif)" value={f.location} maxLength={200} onChange={(e) => set("location", e.target.value)} placeholder="Ex. salle 2, accueil" />
        ) : (
          <Input label="Lien de la visio" type="url" required value={f.visioUrl} maxLength={500} onChange={(e) => set("visioUrl", e.target.value)} placeholder="https://…" />
        )}
      </fieldset>
      {f.mode === "series" && seriesDays.length === 0 && (
        <p className="text-[13px] text-ink-muted">Choisissez les dates et au moins un jour de la semaine pour créer la série.</p>
      )}
      <Button type="submit" disabled={busy || (f.mode === "series" && seriesDays.length === 0)}>
        {busy ? "Enregistrement en cours…" : editing ? "Enregistrer le créneau" : f.mode === "series" ? "Ajouter les créneaux" : "Ajouter le créneau"}
      </Button>
    </form>
  );
}

export default function InterviewSlotsClient({
  churchId,
  initialSlots,
  interviewers,
  toComplete,
  currentUserId,
}: {
  readonly churchId: string;
  readonly initialSlots: Slot[];
  readonly interviewers: readonly Interviewer[];
  readonly toComplete: number;
  readonly currentUserId: string;
}) {
  const toast = useToast();
  const [slots, setSlots] = useState(initialSlots);
  const [pending, setPending] = useState(toComplete);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [removing, setRemoving] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch(`/api/serving/interview-slots?churchId=${encodeURIComponent(churchId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setSlots(body.slots);
    setPending(body.toComplete);
  }

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "La demande n'a pas abouti.");
      return null;
    }
    await reload();
    return json;
  }

  const place = (f: FormState) => ({
    location: f.place === "location" ? f.location.trim() || null : null,
    visioUrl: f.place === "visio" ? f.visioUrl.trim() : null,
    interviewerId: f.interviewerId,
  });

  async function create(f: FormState) {
    const durationMinutes = Number(f.duration);
    const body =
      f.mode === "one"
        ? { churchId, slots: [{ day: f.day, time: f.time, durationMinutes, ...place(f) }] }
        : { churchId, series: { days: expandDays(f.dayFrom, f.dayTo, f.weekdays), from: f.from, to: f.to, durationMinutes, ...place(f) } };
    const json = await send("/api/serving/interview-slots", "POST", body);
    if (json) {
      setAdding(false);
      toast.success(`${json.created} créneau${json.created > 1 ? "x" : ""} ajouté${json.created > 1 ? "s" : ""}.`);
    }
  }

  async function update(f: FormState) {
    if (!editing) return;
    const json = await send(`/api/serving/interview-slots/${editing.id}`, "PATCH", {
      day: f.day,
      time: f.time,
      durationMinutes: Number(f.duration),
      ...place(f),
    });
    if (json) {
      setEditing(null);
      toast.success(editing.candidate ? "Créneau modifié, le candidat est prévenu." : "Créneau modifié.");
    }
  }

  async function remove() {
    if (!removing) return;
    const json = await send(`/api/serving/interview-slots/${removing.id}`, "DELETE");
    if (json) toast.success(removing.candidate ? "Créneau retiré, le candidat est prévenu." : "Créneau retiré.");
    setRemoving(null);
  }

  const blank: FormState = {
    mode: "one",
    day: "",
    time: "",
    dayFrom: "",
    dayTo: "",
    weekdays: [],
    from: "",
    to: "",
    duration: String(DEFAULT_INTERVIEW_MINUTES),
    interviewerId: interviewers.some((i) => i.id === currentUserId) ? currentUserId : "",
    place: "location",
    location: "",
    visioUrl: "",
  };
  const fromSlot = (s: Slot): FormState => ({
    ...blank,
    day: dayKey(s.startsAt),
    time: timeKey(s.startsAt),
    duration: String(s.durationMinutes),
    interviewerId: s.interviewer?.id ?? "",
    place: s.visioUrl ? "visio" : "location",
    location: s.location ?? "",
    visioUrl: s.visioUrl ?? "",
  });

  const days = [...new Set(slots.map((s) => dayKey(s.startsAt)))];
  const free = slots.filter((s) => !s.past && !s.candidate).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {free} créneau{free > 1 ? "x" : ""} libre{free > 1 ? "s" : ""} à venir
        </p>
        <Button type="button" onClick={() => setAdding(true)} disabled={interviewers.length === 0}>
          <CalendarPlus className="size-4" aria-hidden="true" /> Ajouter des créneaux
        </Button>
      </div>
      {interviewers.length === 0 && <Alert tone="warning" title="Aucun compte dans l'équipe Vie des STAR : ajoutez-en un pour recevoir les candidats." />}
      {pending > 0 && (
        <Alert
          tone="warning"
          title={`${pending} entretien${pending > 1 ? "s" : ""} à compléter`}
          action={
            <Link href="/candidatures?onglet=todo" className={`${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`}>
              Voir les candidatures
            </Link>
          }
        >
          L&apos;issue (réalisé, absent, excusé) se note depuis la fiche de la candidature.
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {days.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="Aucun créneau" description="Ajoutez des créneaux : ils seront proposés aux candidats dès l'envoi de leur fiche." />
      ) : (
        days.map((d) => (
          <section key={d} className="space-y-2">
            <h2 className="font-display text-[17px] font-semibold text-ink first-letter:uppercase">{dayLabel(d)}</h2>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-card">
              {slots
                .filter((s) => dayKey(s.startsAt) === d)
                .map((s) => (
                  <li key={s.id} className={`flex flex-wrap items-center gap-3 p-3 ${s.past ? "opacity-70" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink">
                        <span className="font-semibold">{timeKey(s.startsAt)}</span> · {s.durationMinutes} min ·{" "}
                        {s.visioUrl ? "Visio" : (s.location ?? "Lieu non précisé")}
                      </p>
                      <p className="text-[13px] text-ink-muted">
                        {s.interviewer ? `Reçu par ${s.interviewer.name}` : "Personne qui reçoit à choisir"}
                      </p>
                      {s.candidate && (
                        <Link href={`/candidatures/${s.candidate.id}`} className={`${buttonClasses("ghost", "sm")} -ml-3 min-h-11 sm:min-h-9`}>
                          {s.candidate.firstName} {s.candidate.lastName}
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                    {s.toReassign && <StatusChip tone="warning">À réattribuer</StatusChip>}
                    <StatusChip tone={s.past ? "neutral" : s.candidate ? "brand" : "success"}>{s.past ? "Passé" : s.candidate ? "Réservé" : "Libre"}</StatusChip>
                    {!s.past && (
                      <div className="flex gap-1">
                        <IconButton icon={Pencil} aria-label="Modifier le créneau" onClick={() => setEditing(s)} />
                        <IconButton icon={Trash2} aria-label="Retirer le créneau" onClick={() => setRemoving(s)} />
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter des créneaux">
        {adding && <SlotForm initial={blank} interviewers={interviewers} editing={false} busy={busy} onSubmit={create} />}
      </Modal>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Modifier le créneau">
        {editing && (
          <>
            {editing.candidate && (
              <Alert tone="info">
                Réservé par {editing.candidate.firstName} {editing.candidate.lastName} : le rendez-vous suit le créneau et le candidat est prévenu.
              </Alert>
            )}
            <SlotForm initial={fromSlot(editing)} interviewers={interviewers} editing busy={busy} onSubmit={update} />
          </>
        )}
      </Modal>
      <ConfirmModal
        open={removing !== null}
        title="Retirer ce créneau ?"
        message={
          removing?.candidate
            ? `Le rendez-vous de ${removing.candidate.firstName} ${removing.candidate.lastName} sera annulé et le candidat invité à choisir un autre créneau.`
            : "Le créneau ne sera plus proposé."
        }
        confirmLabel="Retirer le créneau"
        confirmingLabel="Retrait en cours…"
        variant="danger"
        confirming={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
