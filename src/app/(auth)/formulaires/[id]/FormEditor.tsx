"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Download, Link2, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Checkbox, ConfirmModal, IconButton, Input, PageHeader, Select, StatusChip, Tabs, Textarea, useToast } from "@/components/ui";
import FormFiller from "@/components/forms/FormFiller";
import type { Answers, FillerForm } from "@/components/forms/types";
import {
  CHOICE_TYPES,
  FORM_KIND_LABELS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  RETENTION_MONTHS,
  type QuestionType,
} from "@/modules/forms/schemas";
import { useApi } from "../use-api";
import SessionsEditor, { type EditorSession } from "./SessionsEditor";
import FacilitatorsEditor, { type Facilitator } from "./FacilitatorsEditor";
import Attendance from "./Attendance";
import Results from "./Results";
import type { FormResults } from "@/modules/forms";

export type EditorTab = "construction" | "reglages" | "apercu" | "reponses" | "presence" | "resultats";

export interface LinkableEvents {
  events: { id: string; title: string; date: string }[];
  ticketing: { id: string; title: string; date: string }[];
}

interface Choice {
  id: string;
  label: string;
  capacity: number | null;
}
interface Question {
  id: string;
  position: number;
  type: QuestionType;
  label: string;
  help: string | null;
  required: boolean;
  config: { min?: number; max?: number; participation?: "attendance" | "companions" } | null;
  conditionQuestionId: string | null;
  conditionValue: string | null;
  choices: Choice[];
}
interface Form {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  kind: "REGISTRATION" | "PARTICIPATION" | "SURVEY";
  access: "PUBLIC" | "MEMBERS";
  anonymous: boolean;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  opensAt: string | null;
  closesAt: string | null;
  maxResponses: number | null;
  waitlistEnabled: boolean;
  offerHoldHours: number;
  retentionMonths: number;
  purgedAt: string | null;
  eventId: string | null;
  ticketingEventId: string | null;
  questions: Question[];
  sessions: EditorSession[];
}
interface Response {
  id: string;
  status: string;
  submittedOn: string;
  answers: { questionId: string; value: unknown }[];
  user: { name: string | null; displayName: string | null; email: string } | null;
  contactEmail: string | null;
  sessionId: string | null;
  levelId: string | null;
  previousLevelDone: boolean | null;
}
interface Usage {
  responses: number;
  answeredQuestions: string[];
  holdingByChoice: Record<string, number>;
  holdingByLevel: Record<string, number>;
}

/** Question en cours d'édition : clé = identifiant existant ou clé provisoire. */
interface Draft {
  key: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  min: string;
  max: string;
  participation: "" | "attendance" | "companions";
  choices: { key: string; label: string; capacity: string }[];
  conditionKey: string;
  conditionValue: string;
}

const STATUS = {
  DRAFT: { tone: "neutral", label: "Brouillon" },
  PUBLISHED: { tone: "success", label: "Publié" },
  CLOSED: { tone: "warning", label: "Clôturé" },
} as const;

const RESPONSE_STATUS: Record<string, string> = {
  CONFIRMED: "Confirmée",
  WAITLISTED: "Liste d'attente",
  OFFERED: "Place proposée",
  CANCELLED: "Annulée",
  DECLINED: "Déclinée",
  EXPIRED: "Expirée",
};

/** Types proposés à l'ajout : « Session et niveau » est ajoutée d'office avec les sessions. */
const AVAILABLE_TYPES = QUESTION_TYPES.filter((t) => t !== "SESSION_LEVEL");

let seq = 0;
const tempKey = () => `new-${Date.now().toString(36)}-${++seq}`;

function toDraft(q: Question): Draft {
  return {
    key: q.id,
    type: q.type,
    label: q.label,
    help: q.help ?? "",
    required: q.required,
    min: q.config?.min?.toString() ?? "",
    max: q.config?.max?.toString() ?? "",
    participation: q.config?.participation ?? "",
    choices: q.choices.map((c) => ({ key: c.id, label: c.label, capacity: c.capacity?.toString() ?? "" })),
    conditionKey: q.conditionQuestionId ?? "",
    conditionValue: q.conditionValue ?? "",
  };
}

function toInput(d: Draft) {
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const isChoice = CHOICE_TYPES.includes(d.type);
  return {
    key: d.key,
    type: d.type,
    label: d.label,
    help: d.help.trim() || null,
    required: d.required,
    config: (() => {
      const bounds = d.type === "NUMBER" && (d.min !== "" || d.max !== "") ? { min: num(d.min), max: num(d.max) } : {};
      const role = d.participation && ((d.participation === "attendance" && d.type === "YES_NO") || (d.participation === "companions" && d.type === "NUMBER")) ? { participation: d.participation } : {};
      return Object.keys(bounds).length || Object.keys(role).length ? { ...bounds, ...role } : null;
    })(),
    choices: isChoice ? d.choices.map((c) => ({ key: c.key, label: c.label, capacity: c.capacity.trim() ? Number(c.capacity) : null })) : undefined,
    condition: d.conditionKey && d.conditionValue ? { questionKey: d.conditionKey, value: d.conditionValue } : null,
  };
}

const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Construction ────────────────────────────────────────────────────────────

function ConditionEditor({ draft, previous, onChange }: { readonly draft: Draft; readonly previous: Draft[]; readonly onChange: (d: Draft) => void }) {
  const eligible = previous.filter((p) => CHOICE_TYPES.includes(p.type) || p.type === "YES_NO");
  if (eligible.length === 0) return null;
  const parent = eligible.find((p) => p.key === draft.conditionKey);
  const values = parent
    ? parent.type === "YES_NO"
      ? [
          { value: "true", label: "Oui" },
          { value: "false", label: "Non" },
        ]
      : parent.choices.map((c) => ({ value: c.key, label: c.label || "(choix sans libellé)" }))
    : [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="Afficher seulement si…"
        value={draft.conditionKey}
        placeholder="Toujours afficher"
        options={eligible.map((p) => ({ value: p.key, label: p.label || "(question sans libellé)" }))}
        onChange={(e) => onChange({ ...draft, conditionKey: e.target.value, conditionValue: "" })}
      />
      {parent && (
        <Select
          label="…vaut"
          value={draft.conditionValue}
          placeholder="Choisir…"
          options={values}
          onChange={(e) => onChange({ ...draft, conditionValue: e.target.value })}
        />
      )}
    </div>
  );
}

function QuestionCard({
  draft,
  index,
  count,
  previous,
  answered,
  contact,
  registration,
  participationForm,
  holding,
  onChange,
  onMove,
  onRemove,
}: {
  readonly draft: Draft;
  readonly index: number;
  readonly count: number;
  readonly previous: Draft[];
  readonly answered: boolean;
  /** Adresse de contact d'un formulaire public nominatif : ajoutée d'office, toujours obligatoire. */
  readonly contact: boolean;
  /** « Session et niveau » : ajoutée d'office avec les sessions, toujours obligatoire. */
  readonly registration: boolean;
  /** Participation : « Je viens » et « Nombre d'accompagnants » servent au total des participants. */
  readonly participationForm: boolean;
  readonly holding: Record<string, number>;
  readonly onChange: (d: Draft) => void;
  readonly onMove: (delta: number) => void;
  readonly onRemove: () => void;
}) {
  const isChoice = CHOICE_TYPES.includes(draft.type);
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink-muted">
          Question {index + 1}
          {contact && <span className="ml-2 font-normal">· adresse de contact, ajoutée d&apos;office</span>}
          {registration && <span className="ml-2 font-normal">· choix de la session et du niveau, ajoutée d&apos;office</span>}
          {answered && <span className="ml-2 font-normal">· a des réponses</span>}
        </p>
        <div className="flex gap-1">
          <IconButton icon={ArrowUp} aria-label="Monter" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} aria-label="Descendre" disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton icon={Trash2} aria-label="Supprimer la question" disabled={answered || contact || registration} onClick={onRemove} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input label="Libellé" value={draft.label} maxLength={300} onChange={(e) => onChange({ ...draft, label: e.target.value })} />
        <Select
          label="Type"
          value={draft.type}
          disabled={answered || contact || registration}
          options={(registration ? QUESTION_TYPES : AVAILABLE_TYPES).map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))}
          onChange={(e) => {
            const type = e.target.value as QuestionType;
            onChange({ ...draft, type, choices: CHOICE_TYPES.includes(type) ? (draft.choices.length ? draft.choices : [{ key: tempKey(), label: "", capacity: "" }]) : [] });
          }}
        />
      </div>
      <Input label="Aide (facultatif)" value={draft.help} maxLength={500} onChange={(e) => onChange({ ...draft, help: e.target.value })} />
      {draft.type === "NUMBER" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Minimum" type="number" value={draft.min} onChange={(e) => onChange({ ...draft, min: e.target.value })} />
          <Input label="Maximum" type="number" value={draft.max} onChange={(e) => onChange({ ...draft, max: e.target.value })} />
        </div>
      )}
      {isChoice && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-ink-muted">Choix (places : vide = illimité)</p>
          {draft.choices.map((c, i) => (
            <div key={c.key} className="grid grid-cols-[1fr_110px_44px] items-end gap-2">
              <Input
                label=""
                aria-label={`Choix ${i + 1}`}
                value={c.label}
                maxLength={200}
                onChange={(e) => onChange({ ...draft, choices: draft.choices.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)) })}
              />
              <Input
                label=""
                aria-label={`Places du choix ${i + 1}`}
                type="number"
                min={1}
                placeholder="Places"
                hint={holding[c.key] ? `${holding[c.key]} pris` : undefined}
                value={c.capacity}
                onChange={(e) => onChange({ ...draft, choices: draft.choices.map((x) => (x.key === c.key ? { ...x, capacity: e.target.value } : x)) })}
              />
              <IconButton
                icon={Trash2}
                aria-label={`Supprimer le choix ${i + 1}`}
                disabled={draft.choices.length <= 1 || !!holding[c.key]}
                onClick={() => onChange({ ...draft, choices: draft.choices.filter((x) => x.key !== c.key) })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...draft, choices: [...draft.choices, { key: tempKey(), label: "", capacity: "" }] })}
          >
            <Plus className="size-4" aria-hidden="true" /> Ajouter un choix
          </Button>
        </div>
      )}
      {participationForm && (draft.type === "YES_NO" || draft.type === "NUMBER") && (
        <label className="flex min-h-11 items-center gap-3">
          <Checkbox
            checked={draft.participation === (draft.type === "YES_NO" ? "attendance" : "companions")}
            onChange={(e) => onChange({ ...draft, participation: e.target.checked ? (draft.type === "YES_NO" ? "attendance" : "companions") : "" })}
          />
          <span className="text-[15px] text-ink">
            {draft.type === "YES_NO" ? "Question « Je viens » (compte les participants)" : "Nombre d'accompagnants (ajouté au total des participants)"}
          </span>
        </label>
      )}
      {!registration && <ConditionEditor draft={draft} previous={previous} onChange={onChange} />}
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox checked={draft.required} disabled={contact || registration} onChange={(e) => onChange({ ...draft, required: e.target.checked })} />
        <span className="text-[15px] text-ink">Réponse obligatoire</span>
      </label>
    </li>
  );
}

function Construction({ form, usage }: { readonly form: Form; readonly usage: Usage }) {
  const { call, busy } = useApi();
  const [drafts, setDrafts] = useState<Draft[]>(() => form.questions.map(toDraft));
  const [newType, setNewType] = useState<QuestionType>("SHORT_TEXT");
  const answered = new Set(usage.answeredQuestions);
  const needsContact = form.access === "PUBLIC" && !form.anonymous;
  const contactKey = needsContact ? drafts.find((d) => d.type === "EMAIL" && d.required && !d.conditionKey)?.key : undefined;
  const update = (i: number, d: Draft) => setDrafts(drafts.map((x, j) => (j === i ? d : x)));
  const move = (i: number, delta: number) => {
    const next = [...drafts];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item);
    // Une condition ne peut viser qu'une question précédente.
    setDrafts(next.map((d, j) => (d.conditionKey && !next.slice(0, j).some((p) => p.key === d.conditionKey) ? { ...d, conditionKey: "", conditionValue: "" } : d)));
  };
  const add = () =>
    setDrafts([
      ...drafts,
      {
        key: tempKey(),
        type: newType,
        label: "",
        help: "",
        required: false,
        min: "",
        max: "",
        participation: "",
        choices: CHOICE_TYPES.includes(newType) ? [{ key: tempKey(), label: "", capacity: "" }] : [],
        conditionKey: "",
        conditionValue: "",
      },
    ]);

  // Participation : « Je viens » et « Nombre d'accompagnants » donnent le total des participants.
  const hasAttendance = drafts.some((d) => d.participation === "attendance");
  const addParticipationQuestions = () => {
    const blank = { help: "", min: "", max: "", choices: [], conditionKey: "", conditionValue: "" };
    const attendance: Draft = { ...blank, key: tempKey(), type: "YES_NO", label: "Je viens", required: usage.responses === 0, participation: "attendance" };
    const companions: Draft = {
      ...blank,
      key: tempKey(),
      type: "NUMBER",
      label: "Nombre d'accompagnants",
      required: false,
      min: "0",
      max: "10",
      participation: "companions",
      conditionKey: attendance.key,
      conditionValue: "true",
    };
    const next = [...drafts, attendance, ...(drafts.some((d) => d.participation === "companions") ? [] : [companions])];
    setDrafts(next);
    void call(`/api/forms/${form.id}`, "PATCH", { questions: next.map(toInput) }, "Questions « Je viens » et « Nombre d'accompagnants » ajoutées");
  };

  return (
    <div className="space-y-4">
      {form.kind === "PARTICIPATION" && !hasAttendance && (
        <Alert tone="info" title="Compter les participants">
          <p>
            Ajoutez « Je viens » (oui / non) et « Nombre d&apos;accompagnants » : l&apos;onglet Résultats affichera le total des
            participants, accompagnants compris. Vous pouvez aussi cocher ce réglage sur une question oui / non ou nombre existante.
          </p>
          <Button type="button" size="sm" className="mt-3" disabled={busy || form.purgedAt !== null} onClick={addParticipationQuestions}>
            <Plus className="size-4" aria-hidden="true" /> Ajouter « Je viens » et « Nombre d&apos;accompagnants »
          </Button>
        </Alert>
      )}
      {form.kind === "REGISTRATION" && (
        <SessionsEditor
          key={JSON.stringify(form.sessions)}
          formId={form.id}
          sessions={form.sessions}
          holdingByLevel={usage.holdingByLevel}
          responses={usage.responses}
          disabled={form.purgedAt !== null}
        />
      )}
      {needsContact && (
        <p className="text-[14px] text-ink-muted">
          Formulaire public : une question Email obligatoire est ajoutée d&apos;office. Elle sert à l&apos;accusé de réception, à repérer
          les doublons et au lien qui permet à chacun de retrouver, modifier ou annuler sa réponse.
        </p>
      )}
      {usage.responses > 0 && (
        <Alert tone="info" title="Ce formulaire a déjà des réponses.">
          Vous pouvez corriger les libellés, ajouter une question facultative et augmenter les places ; pas supprimer une question
          répondue, ni baisser des places sous les réponses déjà reçues.
        </Alert>
      )}
      <ol className="space-y-3">
        {drafts.map((d, i) => (
          <QuestionCard
            key={d.key}
            draft={d}
            index={i}
            count={drafts.length}
            previous={drafts.slice(0, i)}
            answered={answered.has(d.key)}
            contact={d.key === contactKey}
            registration={d.type === "SESSION_LEVEL"}
            participationForm={form.kind === "PARTICIPATION"}
            holding={usage.holdingByChoice}
            onChange={(next) => update(i, next)}
            onMove={(delta) => move(i, delta)}
            onRemove={() => setDrafts(drafts.filter((_, j) => j !== i).map((x) => (x.conditionKey === d.key ? { ...x, conditionKey: "", conditionValue: "" } : x)))}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-60">
          <Select label="Nouvelle question" value={newType} options={AVAILABLE_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))} onChange={(e) => setNewType(e.target.value as QuestionType)} />
        </div>
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="size-4" aria-hidden="true" /> Ajouter
        </Button>
        <Button type="button" disabled={busy || form.purgedAt !== null} onClick={() => void call(`/api/forms/${form.id}`, "PATCH", { questions: drafts.map(toInput) }, "Questions enregistrées")}>
          {busy ? "Enregistrement…" : "Enregistrer les questions"}
        </Button>
      </div>
    </div>
  );
}

// ─── Réglages ────────────────────────────────────────────────────────────────

function Settings({
  form,
  usage,
  members,
  facilitators,
  linkable,
}: {
  readonly form: Form;
  readonly usage: Usage;
  readonly members: { id: string; name: string }[];
  readonly facilitators: Facilitator[];
  readonly linkable: LinkableEvents;
}) {
  const { call, busy } = useApi();
  const [s, setS] = useState({
    title: form.title,
    description: form.description ?? "",
    slug: form.slug,
    access: form.access,
    anonymous: form.anonymous,
    opensAt: toLocal(form.opensAt),
    closesAt: toLocal(form.closesAt),
    maxResponses: form.maxResponses?.toString() ?? "",
    waitlistEnabled: form.waitlistEnabled,
    offerHoldHours: String(form.offerHoldHours),
    retentionMonths: String(form.retentionMonths),
    link: form.eventId ? `event:${form.eventId}` : form.ticketingEventId ? `ticketing:${form.ticketingEventId}` : "",
  });
  const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
  const save = () =>
    call(
      `/api/forms/${form.id}`,
      "PATCH",
      {
        title: s.title,
        description: s.description.trim() || null,
        slug: s.slug,
        access: s.access,
        anonymous: s.anonymous,
        opensAt: s.opensAt ? new Date(s.opensAt).toISOString() : null,
        closesAt: s.closesAt ? new Date(s.closesAt).toISOString() : null,
        maxResponses: s.maxResponses ? Number(s.maxResponses) : null,
        waitlistEnabled: s.waitlistEnabled,
        offerHoldHours: Number(s.offerHoldHours),
        retentionMonths: Number(s.retentionMonths),
        ...(form.kind === "PARTICIPATION"
          ? {
              eventId: s.link.startsWith("event:") ? s.link.slice(6) : null,
              ticketingEventId: s.link.startsWith("ticketing:") ? s.link.slice(10) : null,
            }
          : {}),
      },
      "Réglages enregistrés"
    );

  return (
    <div className="max-w-2xl space-y-4">
      <Input label="Titre" value={s.title} maxLength={150} onChange={(e) => setS({ ...s, title: e.target.value })} />
      <Textarea label="Présentation (facultatif)" rows={3} value={s.description} maxLength={5000} onChange={(e) => setS({ ...s, description: e.target.value })} />
      <Input label="Adresse" hint="Lettres minuscules, chiffres et tirets." value={s.slug} maxLength={80} onChange={(e) => setS({ ...s, slug: e.target.value })} />
      <Select
        label="Qui peut répondre ?"
        value={s.access}
        options={[
          { value: "PUBLIC", label: "Tout le monde, par le lien (sans compte)" },
          { value: "MEMBERS", label: "Les comptes connectés de l'église" },
        ]}
        onChange={(e) => setS({ ...s, access: e.target.value as Form["access"] })}
      />
      {form.kind === "SURVEY" && (
        <label className="flex min-h-11 items-center gap-3">
          <Checkbox checked={s.anonymous} disabled={usage.responses > 0} onChange={(e) => setS({ ...s, anonymous: e.target.checked })} />
          <span className="text-[15px] text-ink">Sondage anonyme{usage.responses > 0 ? " (figé : il y a des réponses)" : ""}</span>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Ouverture des réponses" hint="Vide : dès la publication." type="datetime-local" value={s.opensAt} onChange={(e) => setS({ ...s, opensAt: e.target.value })} />
        <Input label="Fin des réponses" hint="Le formulaire est alors clôturé." type="datetime-local" value={s.closesAt} onChange={(e) => setS({ ...s, closesAt: e.target.value })} />
      </div>
      {form.kind === "PARTICIPATION" && (
        <Select
          label="Événement rattaché"
          hint="Le formulaire apparaît sur la page de l'événement."
          value={s.link}
          placeholder="Aucun"
          options={[
            ...linkable.events.map((e) => ({ value: `event:${e.id}`, label: `${e.title} — ${dayFr(e.date)}` })),
            ...linkable.ticketing.map((e) => ({ value: `ticketing:${e.id}`, label: `Billetterie : ${e.title} — ${dayFr(e.date)}` })),
          ]}
          onChange={(e) => setS({ ...s, link: e.target.value })}
        />
      )}
      <Input label="Nombre maximal de réponses" hint="Vide : sans limite." type="number" min={1} value={s.maxResponses} onChange={(e) => setS({ ...s, maxResponses: e.target.value })} />
      {!s.anonymous && (
        <>
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox checked={s.waitlistEnabled} onChange={(e) => setS({ ...s, waitlistEnabled: e.target.checked })} />
            <span className="text-[15px] text-ink">Liste d&apos;attente quand un choix ou un niveau est complet</span>
          </label>
          {s.waitlistEnabled && (
            <Input
              label="Délai pour confirmer une place proposée (heures)"
              hint="Passé ce délai, la place est proposée à la personne suivante."
              type="number"
              min={1}
              max={336}
              value={s.offerHoldHours}
              onChange={(e) => setS({ ...s, offerHoldHours: e.target.value })}
            />
          )}
        </>
      )}
      <Select
        label="Conservation des réponses après la clôture"
        value={s.retentionMonths}
        options={Array.from({ length: RETENTION_MONTHS.max }, (_, i) => ({ value: String(i + 1), label: `${i + 1} mois${i + 1 === RETENTION_MONTHS.default ? " (par défaut)" : ""}` }))}
        hint="Ensuite, les réponses nominatives sont effacées ; les totaux restent."
        onChange={(e) => setS({ ...s, retentionMonths: e.target.value })}
      />
      <Button type="button" disabled={busy || !s.title.trim()} onClick={() => void save()}>
        {busy ? "Enregistrement…" : "Enregistrer les réglages"}
      </Button>
      {form.kind === "REGISTRATION" && form.sessions.length > 0 && (
        <div className="border-t border-line pt-4">
          <FacilitatorsEditor key={JSON.stringify(facilitators)} formId={form.id} sessions={form.sessions} members={members} initial={facilitators} />
        </div>
      )}
    </div>
  );
}

// ─── Aperçu et réponses ──────────────────────────────────────────────────────

function Preview({ form, usage }: { readonly form: Form; readonly usage: Usage }) {
  const [answers, setAnswers] = useState<Answers>({});
  const filler: FillerForm = useMemo(
    () => ({
      id: form.id,
      title: form.title,
      description: form.description,
      anonymous: form.anonymous,
      waitlistEnabled: form.waitlistEnabled,
      questions: form.questions.map((q) => ({
        ...q,
        choices: q.choices.map((c) => ({ id: c.id, label: c.label, remaining: c.capacity == null ? null : Math.max(0, c.capacity - (usage.holdingByChoice[c.id] ?? 0)) })),
      })),
      sessions: form.sessions.map((session) => ({
        ...session,
        levels: session.levels.map((l) => ({ ...l, remaining: Math.max(0, l.capacity - (usage.holdingByLevel[l.id] ?? 0)) })),
      })),
    }),
    [form, usage]
  );
  return (
    <div className="max-w-xl space-y-4 rounded-card border border-dashed border-line bg-surface-sunken p-4">
      <p className="text-[13px] text-ink-muted">Aperçu des questions enregistrées : rien n&apos;est envoyé.</p>
      <FormFiller form={filler} answers={answers} onChange={setAnswers} />
    </div>
  );
}

function display(q: Question, value: unknown): string {
  if (value === undefined || value === null) return "";
  const label = (id: unknown) => q.choices.find((c) => c.id === id)?.label ?? String(id);
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (CHOICE_TYPES.includes(q.type)) return label(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return String(value);
}

function Responses({ form, responses: all, manage }: { readonly form: Form; readonly responses: Response[]; readonly manage: boolean }) {
  const { call, busy } = useApi();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState("");
  const hasSessions = form.sessions.length > 0;
  const responses = sessionFilter ? all.filter((r) => r.sessionId === sessionFilter) : all;
  const shown = form.questions.filter((q) => q.type !== "SESSION_LEVEL").slice(0, 4);
  const active = responses.filter((r) => ["CONFIRMED", "WAITLISTED", "OFFERED"].includes(r.status)).length;
  const sessionOf = new Map(form.sessions.map((x) => [x.id, x]));
  const levelOf = new Map(form.sessions.flatMap((x) => x.levels.map((l) => [l.id, l] as const)));
  // Décompte par niveau : places tenues (confirmées ou proposées) et liste d'attente.
  const counts = (levelId: string, statuses: string[]) => all.filter((r) => r.levelId === levelId && statuses.includes(r.status)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-ink">
          {active} réponse{active > 1 ? "s" : ""} active{active > 1 ? "s" : ""} sur {responses.length}
        </p>
        {manage && (
          <a href={`/api/forms/${form.id}/export`} className="inline-flex items-center gap-2 text-[15px] font-semibold text-brand-text underline">
            <Download className="size-4" aria-hidden="true" /> Exporter (.xlsx)
          </a>
        )}
      </div>
      {hasSessions && (
        <div className="space-y-3">
          <div className="max-w-sm">
            <Select
              label="Session"
              value={sessionFilter}
              placeholder="Toutes les sessions"
              options={form.sessions.map((x) => ({ value: x.id, label: x.label }))}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {form.sessions
              .filter((x) => !sessionFilter || x.id === sessionFilter)
              .flatMap((x) =>
                x.levels.map((l) => {
                  const held = counts(l.id, ["CONFIRMED", "OFFERED"]);
                  const waiting = counts(l.id, ["WAITLISTED"]);
                  return (
                    <li key={l.id} className="rounded-control border border-line bg-surface px-3 py-2 text-[14px]">
                      <p className="font-semibold text-ink">
                        {x.label} — niveau {l.code}
                      </p>
                      <p className="text-ink-muted">
                        {held} / {l.capacity} place{l.capacity > 1 ? "s" : ""}
                        {waiting ? ` · ${waiting} en attente` : ""}
                      </p>
                    </li>
                  );
                })
              )}
          </ul>
        </div>
      )}
      {responses.length === 0 ? (
        <p className="text-ink-muted">Aucune réponse pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-surface-sunken text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
                {!form.anonymous && <th className="px-3 py-2 font-semibold">Répondant</th>}
                {hasSessions && (
                  <>
                    <th className="px-3 py-2 font-semibold">Session</th>
                    <th className="px-3 py-2 font-semibold">Niveau</th>
                    <th className="px-3 py-2 font-semibold">Niveau précédent suivi</th>
                  </>
                )}
                {shown.map((q) => (
                  <th key={q.id} className="px-3 py-2 font-semibold">
                    {q.label}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {responses.map((r) => {
                const values = new Map(r.answers.map((a) => [a.questionId, a.value]));
                const open = ["CONFIRMED", "WAITLISTED", "OFFERED"].includes(r.status);
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.submittedOn).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</td>
                    <td className="px-3 py-2">{RESPONSE_STATUS[r.status] ?? r.status}</td>
                    {!form.anonymous && <td className="px-3 py-2">{r.user ? (r.user.displayName ?? r.user.name ?? r.user.email) : (r.contactEmail ?? "")}</td>}
                    {hasSessions && (
                      <>
                        <td className="px-3 py-2">{r.sessionId ? (sessionOf.get(r.sessionId)?.label ?? "") : ""}</td>
                        <td className="px-3 py-2">{r.levelId ? (levelOf.get(r.levelId)?.code ?? "") : ""}</td>
                        <td className="px-3 py-2">{r.previousLevelDone === null ? "—" : r.previousLevelDone ? "Oui" : "Non"}</td>
                      </>
                    )}
                    {shown.map((q) => (
                      <td key={q.id} className="max-w-60 truncate px-3 py-2">
                        {display(q, values.get(q.id))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      {open && manage && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(r.id)}>
                          Annuler
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {manage && form.questions.length > shown.length && <p className="text-[13px] text-ink-muted">Toutes les questions figurent dans l&apos;export.</p>}
      <ConfirmModal
        open={cancelling !== null}
        title="Annuler cette réponse ?"
        message="La réponse passe à « Annulée » et libère sa place."
        confirmLabel="Annuler la réponse"
        variant="danger"
        confirming={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={async () => {
          if (cancelling) await call(`/api/forms/${form.id}/responses/${cancelling}`, "PATCH", { action: "cancel" }, "Réponse annulée");
          setCancelling(null);
        }}
      />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FormEditor({
  tab,
  form,
  churchSlug,
  usage,
  responses,
  manage,
  members,
  facilitators,
  linkable,
  results,
}: {
  readonly tab: EditorTab;
  readonly form: Form;
  readonly churchSlug: string;
  readonly usage: Usage;
  readonly responses: Response[];
  /** false : intervenant (réponses et présence de son périmètre seulement). */
  readonly manage: boolean;
  readonly members: { id: string; name: string }[];
  readonly facilitators: Facilitator[];
  readonly linkable: LinkableEvents;
  readonly results: FormResults | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { call, busy } = useApi();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const path = `/f/${churchSlug}/${form.slug}`;
  const base = `/formulaires/${form.id}`;
  const hasSessions = form.sessions.length > 0;

  if (!manage) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Formulaires · intervenant" title={form.title} />
        <Tabs
          ariaLabel="Sections du formulaire"
          tabs={[
            { href: `${base}?onglet=reponses`, label: "Inscrits", active: tab === "reponses" },
            ...(hasSessions ? [{ href: `${base}?onglet=presence`, label: "Présence", active: tab === "presence" }] : []),
            { href: `${base}?onglet=resultats`, label: "Résultats", active: tab === "resultats" },
          ]}
        />
        {tab === "presence" && hasSessions ? (
          <Attendance formId={form.id} sessions={form.sessions} />
        ) : tab === "resultats" && results ? (
          <Results results={results} anonymous={form.anonymous} manage={false} formId={form.id} />
        ) : (
          <Responses form={form} responses={responses} manage={false} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Formulaires · ${FORM_KIND_LABELS[form.kind]}${form.anonymous ? " anonyme" : ""}`}
        title={form.title}
        actions={<StatusChip tone={STATUS[form.status].tone}>{STATUS[form.status].label}</StatusChip>}
      />
      <div className="flex flex-wrap gap-2">
        {form.status === "DRAFT" && (
          <Button type="button" disabled={busy} onClick={() => void call(`/api/forms/${form.id}/status`, "POST", { action: "publish" }, "Formulaire publié")}>
            Publier
          </Button>
        )}
        {form.status === "PUBLISHED" && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void call(`/api/forms/${form.id}/status`, "POST", { action: "close" }, "Formulaire clôturé")}>
            Clôturer
          </Button>
        )}
        {form.status === "CLOSED" && !form.purgedAt && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void call(`/api/forms/${form.id}/status`, "POST", { action: "reopen" }, "Formulaire rouvert")}>
            Rouvrir
          </Button>
        )}
        {form.status !== "DRAFT" && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}${path}`);
              toast.success("Lien copié");
            }}
          >
            <Link2 className="size-4" aria-hidden="true" /> Copier le lien
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const copy = await call<{ id: string }>(`/api/forms/${form.id}/duplicate`, "POST", {}, "Copie créée");
            if (copy) router.push(`/formulaires/${copy.id}`);
          }}
        >
          <Copy className="size-4" aria-hidden="true" /> Dupliquer
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" aria-hidden="true" /> Supprimer
        </Button>
      </div>
      {form.purgedAt && <Alert tone="info" title="Les réponses ont été effacées au terme de la durée de conservation ; seuls les totaux restent." />}
      <Tabs
        ariaLabel="Sections du formulaire"
        tabs={[
          { href: `${base}?onglet=construction`, label: "Construction", active: tab === "construction" },
          { href: `${base}?onglet=reglages`, label: "Réglages", active: tab === "reglages" },
          { href: `${base}?onglet=apercu`, label: "Aperçu", active: tab === "apercu" },
          { href: `${base}?onglet=reponses`, label: "Réponses", count: usage.responses, active: tab === "reponses" },
          ...(hasSessions ? [{ href: `${base}?onglet=presence`, label: "Présence", active: tab === "presence" }] : []),
          { href: `${base}?onglet=resultats`, label: "Résultats", active: tab === "resultats" },
        ]}
      />
      {tab === "construction" && <Construction key={JSON.stringify(form.questions.map((q) => q.id))} form={form} usage={usage} />}
      {tab === "reglages" && <Settings form={form} usage={usage} members={members} facilitators={facilitators} linkable={linkable} />}
      {tab === "resultats" && results && <Results results={results} anonymous={form.anonymous} manage formId={form.id} />}
      {tab === "apercu" && <Preview form={form} usage={usage} />}
      {tab === "reponses" && <Responses form={form} responses={responses} manage />}
      {tab === "presence" && hasSessions && <Attendance formId={form.id} sessions={form.sessions} />}
      <ConfirmModal
        open={confirmDelete}
        title="Supprimer ce formulaire ?"
        message="Ses réponses sont effacées tout de suite, sans retour possible. Le lien affichera « formulaire non disponible »."
        confirmLabel="Supprimer"
        variant="danger"
        confirming={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const done = await call(`/api/forms/${form.id}`, "DELETE", undefined, "Formulaire supprimé");
          setConfirmDelete(false);
          if (done) router.push("/formulaires");
        }}
      />
    </div>
  );
}
