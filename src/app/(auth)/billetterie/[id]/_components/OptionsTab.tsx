"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, EmptyState, IconButton, Input, Modal, StatusChip } from "@/components/ui";
import type { EventDetail } from "@/modules/ticketing";
import { OPTION_SCOPE_LABEL, formatEuros } from "@/modules/ticketing/schemas";
import type { TicketingOptionScope, TicketingOptionType } from "@/generated/prisma/enums";
import { useApi } from "../../use-api";
import DishList from "./DishList";
import { fromLocalInput, toLocalInput } from "./SettingsTab";

type Option = EventDetail["options"][number];

/** Types d'option expliqués par un exemple, dans l'ordre où on les rencontre le plus. */
const TYPES: { value: TicketingOptionType; title: string; example: string }[] = [
  { value: "CHOICE", title: "Menu à choisir", example: "Un plat parmi plusieurs : poulet, poisson, végétarien…" },
  { value: "CHECKBOX", title: "Case à cocher", example: "Oui ou non : navette, repas unique, accès VIP…" },
  { value: "QUANTITY", title: "Quantité", example: "Plusieurs exemplaires : t-shirts, tickets boisson…" },
];
const TYPE_TITLE = Object.fromEntries(TYPES.map((t) => [t.value, t.title])) as Record<TicketingOptionType, string>;

const SCOPES: { value: TicketingOptionScope; title: string; example: string }[] = [
  { value: "PARTICIPANT", title: "Par participant", example: "Chacun choisit la sienne (un repas par personne)." },
  { value: "BOOKING", title: "Par réservation", example: "Une fois pour tout le groupe (une place de parking)." },
];

interface Draft {
  label: string;
  description: string;
  type: TicketingOptionType;
  scope: TicketingOptionScope;
  price: string;
  stock: string;
  pickup: boolean;
  namedPrep: boolean;
  refundable: boolean;
  refundDeadline: string;
  active: boolean;
  choiceGroup: string;
  variants: string;
}

const emptyDraft: Draft = {
  label: "",
  description: "",
  type: "CHOICE",
  scope: "PARTICIPANT",
  price: "0",
  stock: "",
  pickup: true,
  namedPrep: false,
  refundable: true,
  refundDeadline: "",
  active: true,
  choiceGroup: "",
  variants: "",
};

function draftOf(o: Option): Draft {
  return {
    label: o.label,
    description: o.description ?? "",
    type: o.type,
    scope: o.scope,
    price: String(o.price),
    stock: o.stock === null ? "" : String(o.stock),
    pickup: o.pickup,
    namedPrep: o.namedPrep,
    refundable: o.refundable,
    refundDeadline: toLocalInput(o.refundDeadline),
    active: o.active,
    choiceGroup: o.choiceGroup ?? "",
    variants: "",
  };
}

function Flag({ label, hint, checked, onChange }: { readonly label: string; readonly hint?: string; readonly checked: boolean; readonly onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-start gap-3">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Choix exclusif présenté en cartes (titre + exemple), à la place d'une liste déroulante. */
function CardChoice<T extends string>({
  legend,
  name,
  items,
  value,
  disabled,
  hint,
  onChange,
}: {
  readonly legend: string;
  readonly name: string;
  readonly items: { value: T; title: string; example: string }[];
  readonly value: T;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-ink">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <label
            key={it.value}
            className={`flex cursor-pointer items-start gap-2 rounded-control border p-3 ${
              value === it.value ? "border-brand bg-brand-soft" : "border-control-line bg-surface"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={name}
              className="mt-0.5 size-4 accent-brand"
              checked={value === it.value}
              disabled={disabled}
              onChange={() => onChange(it.value)}
            />
            <span>
              <span className="block text-[15px] font-medium text-ink">{it.title}</span>
              <span className="block text-[13px] text-ink-muted">{it.example}</span>
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
    </fieldset>
  );
}

/** Fenêtre de création ou de modification d'une option, plats compris. */
function OptionEditor({
  event,
  option,
  onClose,
}: {
  readonly event: EventDetail;
  readonly option: Option | null;
  readonly onClose: () => void;
}) {
  const { call, busy } = useApi();
  const [d, setD] = useState<Draft>(option ? draftOf(option) : emptyDraft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }));
  const groups = [...new Set(event.options.map((o) => o.choiceGroup).filter((g): g is string => !!g))];
  const locked = !!option && option.used > 0;

  async function save() {
    const body = {
      label: d.label,
      description: d.description || null,
      type: d.type,
      scope: d.scope,
      price: Number(d.price.replace(",", ".")),
      stock: d.stock === "" ? null : Number(d.stock),
      pickup: d.pickup,
      namedPrep: d.pickup && d.namedPrep,
      refundable: d.refundable,
      refundDeadline: d.refundable ? fromLocalInput(d.refundDeadline) : null,
      active: d.active,
      choiceGroup: d.choiceGroup.trim() || null,
    };
    const ok = option
      ? await call(`/api/ticketing/events/${event.id}/options/${option.id}`, "PATCH", body, "Option enregistrée")
      : await call(
          `/api/ticketing/events/${event.id}/options`,
          "POST",
          { ...body, variants: d.variants.split("\n").map((v) => v.trim()).filter(Boolean).map((label) => ({ label })) },
          "Option ajoutée"
        );
    if (ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title={option ? `Modifier « ${option.label} »` : "Nouvelle option"} size="lg">
      <div className="space-y-4">
        <Input label="Nom de l'option" placeholder="Repas du soir, T-shirt, Navette…" value={d.label} maxLength={120} onChange={(e) => set("label", e.target.value)} />
        <CardChoice
          legend="Type"
          name="option-type"
          items={TYPES}
          value={d.type}
          disabled={locked}
          hint={locked ? "Déjà choisie par des inscrits : son type ne change plus." : undefined}
          onChange={(v) => set("type", v)}
        />
        <CardChoice legend="Pour qui" name="option-scope" items={SCOPES} value={d.scope} onChange={(v) => set("scope", v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Prix (€)" hint="0 = gratuit" inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value)} />
          <Input
            label="Stock total (facultatif)"
            hint={option ? `${option.used} déjà réservé${option.used > 1 ? "s" : ""} ; vide = illimité` : "Vide = illimité"}
            type="number"
            min={0}
            value={d.stock}
            onChange={(e) => set("stock", e.target.value)}
          />
        </div>

        {d.type === "CHOICE" &&
          (option ? (
            <section className="space-y-2">
              <h3 className="text-[15px] font-semibold text-ink">Plats</h3>
              <DishList eventId={event.id} optionId={option.id} dishes={option.variants} />
            </section>
          ) : (
            <label className="block space-y-1">
              <span className="text-[13px] font-medium text-ink">Plats (un par ligne, facultatif)</span>
              <textarea
                className="w-full rounded-control border border-control-line bg-surface p-2 text-[15px] text-ink"
                rows={3}
                placeholder={"Poulet yassa\nPoisson braisé\nVégétarien"}
                value={d.variants}
                onChange={(e) => set("variants", e.target.value)}
              />
              <span className="text-[13px] text-ink-muted">Vous pourrez en ajouter, en modifier ou en fermer ensuite.</span>
            </label>
          ))}

        <Input label="Description (facultative)" value={d.description} maxLength={500} onChange={(e) => set("description", e.target.value)} />

        <details className="rounded-control border border-line p-3" open={!!(d.choiceGroup || !d.refundable || d.refundDeadline)}>
          <summary className="cursor-pointer text-[15px] font-medium text-ink">Réglages avancés</summary>
          <div className="mt-3 space-y-3">
            <Input
              label="Groupe au choix unique (facultatif)"
              list={`${event.id}-groups`}
              maxLength={60}
              value={d.choiceGroup}
              hint="Même groupe (par exemple « Repas ») : l'inscrit ne prend qu'une de ces options."
              onChange={(e) => set("choiceGroup", e.target.value)}
            />
            <datalist id={`${event.id}-groups`}>
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <Flag label="À retirer sur place" hint="La restauration la distribue le jour J (repas, t-shirt…)." checked={d.pickup} onChange={(v) => set("pickup", v)} />
            {d.pickup && <Flag label="Préparation nominative" hint="Une étiquette au nom de chaque personne." checked={d.namedPrep} onChange={(v) => set("namedPrep", v)} />}
            <Flag label="Remboursable en cas d'annulation" checked={d.refundable} onChange={(v) => set("refundable", v)} />
            {d.refundable && (
              <Input label="Date limite de remboursement (facultative)" type="datetime-local" value={d.refundDeadline} onChange={(e) => set("refundDeadline", e.target.value)} />
            )}
            {option && <Flag label="Proposée aux inscrits" hint="Décochée, l'option disparaît du formulaire sans toucher aux réservations." checked={d.active} onChange={(v) => set("active", v)} />}
          </div>
        </details>

        <div className="flex gap-2">
          <Button type="button" disabled={busy || !d.label.trim()} onClick={save}>
            {busy ? "Enregistrement…" : option ? "Enregistrer" : "Créer l'option"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Carte d'une option : prix, réglages en clair et, pour un menu, ses plats modifiables sur place. */
function OptionCard({ event, option, onEdit }: { readonly event: EventDetail; readonly option: Option; readonly onEdit: () => void }) {
  const { call, busy } = useApi();
  const facts = [
    TYPE_TITLE[option.type],
    OPTION_SCOPE_LABEL[option.scope].toLowerCase(),
    `${option.used} réservé${option.used > 1 ? "s" : ""}${option.stock !== null ? ` / ${option.stock}` : ""}`,
    option.pickup ? "à retirer sur place" : null,
    option.refundable ? null : "non remboursable",
  ].filter(Boolean);
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {option.label} <span className="font-normal text-ink-muted">— {option.price > 0 ? formatEuros(option.price) : "gratuit"}</span>
          </p>
          <p className="text-[13px] text-ink-muted">{facts.join(" · ")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {option.choiceGroup && <StatusChip tone="info">Groupe « {option.choiceGroup} »</StatusChip>}
            {!option.active && <StatusChip>Non proposée</StatusChip>}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton icon={Pencil} aria-label={`Modifier ${option.label}`} onClick={onEdit} />
          <IconButton
            icon={Trash2}
            aria-label={option.used > 0 ? `Désactiver ${option.label}` : `Supprimer ${option.label}`}
            disabled={busy}
            onClick={() =>
              call(`/api/ticketing/events/${event.id}/options/${option.id}`, "DELETE", undefined, option.used > 0 ? "Option désactivée" : "Option supprimée")
            }
          />
        </div>
      </div>
      {option.type === "CHOICE" && <DishList eventId={event.id} optionId={option.id} dishes={option.variants} />}
    </li>
  );
}

/** Onglet Options (organisateur) : chaque option en carte, ses plats juste dessous. */
export default function OptionsTab({ event }: { readonly event: EventDetail }) {
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const current = editing?.id ? (event.options.find((o) => o.id === editing.id) ?? null) : null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-[15px] text-ink-muted">Repas, t-shirts, navette… ce que les inscrits peuvent ajouter à leur entrée.</p>
        <Button type="button" onClick={() => setEditing({ id: null })}>
          <Plus className="size-4" aria-hidden="true" /> Ajouter une option
        </Button>
      </div>
      {event.options.length === 0 ? (
        <EmptyState title="Aucune option" description="Un concert peut s'en passer. Pour un repas, créez une option « Menu à choisir » et ajoutez-y les plats." />
      ) : (
        <ul className="space-y-3">
          {event.options.map((o) => (
            <OptionCard key={o.id} event={event} option={o} onEdit={() => setEditing({ id: o.id })} />
          ))}
        </ul>
      )}
      {editing && <OptionEditor key={editing.id ?? "new"} event={event} option={current} onClose={() => setEditing(null)} />}
    </section>
  );
}
