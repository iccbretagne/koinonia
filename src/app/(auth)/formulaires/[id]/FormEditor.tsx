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

export type EditorTab = "construction" | "reglages" | "apercu" | "reponses";

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
  config: { min?: number; max?: number } | null;
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
  questions: Question[];
}
interface Response {
  id: string;
  status: string;
  submittedOn: string;
  answers: { questionId: string; value: unknown }[];
  user: { name: string | null; displayName: string | null; email: string } | null;
  contactEmail: string | null;
}
interface Usage {
  responses: number;
  answeredQuestions: string[];
  holdingByChoice: Record<string, number>;
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

/** Types proposés au lot 1 (la session/niveau arrive avec les inscriptions PCNC). */
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
    config: d.type === "NUMBER" && (d.min !== "" || d.max !== "") ? { min: num(d.min), max: num(d.max) } : null,
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
          {answered && <span className="ml-2 font-normal">· a des réponses</span>}
        </p>
        <div className="flex gap-1">
          <IconButton icon={ArrowUp} aria-label="Monter" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} aria-label="Descendre" disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton icon={Trash2} aria-label="Supprimer la question" disabled={answered} onClick={onRemove} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input label="Libellé" value={draft.label} maxLength={300} onChange={(e) => onChange({ ...draft, label: e.target.value })} />
        <Select
          label="Type"
          value={draft.type}
          disabled={answered}
          options={AVAILABLE_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))}
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
      <ConditionEditor draft={draft} previous={previous} onChange={onChange} />
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} />
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
        choices: CHOICE_TYPES.includes(newType) ? [{ key: tempKey(), label: "", capacity: "" }] : [],
        conditionKey: "",
        conditionValue: "",
      },
    ]);

  return (
    <div className="space-y-4">
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

function Settings({ form, usage }: { readonly form: Form; readonly usage: Usage }) {
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
  });
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
      <Input label="Nombre maximal de réponses" hint="Vide : sans limite." type="number" min={1} value={s.maxResponses} onChange={(e) => setS({ ...s, maxResponses: e.target.value })} />
      {/* Liste d'attente : réglage proposé avec les places proposées à confirmer (spec 079, lot 2). */}
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

function Responses({ form, responses }: { readonly form: Form; readonly responses: Response[] }) {
  const { call, busy } = useApi();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const shown = form.questions.slice(0, 4);
  const active = responses.filter((r) => ["CONFIRMED", "WAITLISTED", "OFFERED"].includes(r.status)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-ink">
          {active} réponse{active > 1 ? "s" : ""} active{active > 1 ? "s" : ""} sur {responses.length}
        </p>
        <a href={`/api/forms/${form.id}/export`} className="inline-flex items-center gap-2 text-[15px] font-semibold text-brand-text underline">
          <Download className="size-4" aria-hidden="true" /> Exporter (.xlsx)
        </a>
      </div>
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
                    {shown.map((q) => (
                      <td key={q.id} className="max-w-60 truncate px-3 py-2">
                        {display(q, values.get(q.id))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      {open && (
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
      {form.questions.length > shown.length && <p className="text-[13px] text-ink-muted">Toutes les questions figurent dans l&apos;export.</p>}
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
}: {
  readonly tab: EditorTab;
  readonly form: Form;
  readonly churchSlug: string;
  readonly usage: Usage;
  readonly responses: Response[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { call, busy } = useApi();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const path = `/f/${churchSlug}/${form.slug}`;
  const base = `/formulaires/${form.id}`;

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
        ]}
      />
      {tab === "construction" && <Construction key={JSON.stringify(form.questions.map((q) => q.id))} form={form} usage={usage} />}
      {tab === "reglages" && <Settings form={form} usage={usage} />}
      {tab === "apercu" && <Preview form={form} usage={usage} />}
      {tab === "reponses" && <Responses form={form} responses={responses} />}
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
