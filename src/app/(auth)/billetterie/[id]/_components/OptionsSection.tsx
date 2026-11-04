"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Input, Modal, Select, StatusChip } from "@/components/ui";
import type { EventDetail } from "@/modules/ticketing";
import { OPTION_SCOPES, OPTION_SCOPE_LABEL, OPTION_TYPES, OPTION_TYPE_LABEL, formatEuros } from "@/modules/ticketing/schemas";
import type { TicketingOptionScope, TicketingOptionType } from "@/generated/prisma/enums";
import { useApi } from "../../use-api";
import { fromLocalInput, toLocalInput } from "./SettingsTab";

type Option = EventDetail["options"][number];

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
    variants: "",
  };
}

function Flag({ label, checked, onChange }: { readonly label: string; readonly checked: boolean; readonly onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-[15px] text-ink">{label}</span>
    </label>
  );
}

/** Options de l'événement (organisateur) : existence, prix, stock, retrait, remboursement. */
export default function OptionsSection({ event }: { readonly event: EventDetail }) {
  const { call, busy } = useApi();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const d = editing?.draft;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [key]: value } } : e));

  async function save() {
    if (!editing) return;
    const x = editing.draft;
    const body = {
      label: x.label,
      description: x.description || null,
      type: x.type,
      scope: x.scope,
      price: Number(x.price.replace(",", ".")),
      stock: x.stock === "" ? null : Number(x.stock),
      pickup: x.pickup,
      namedPrep: x.namedPrep,
      refundable: x.refundable,
      refundDeadline: fromLocalInput(x.refundDeadline),
      active: x.active,
    };
    const ok = editing.id
      ? await call(`/api/ticketing/events/${event.id}/options/${editing.id}`, "PATCH", body, "Option enregistrée")
      : await call(`/api/ticketing/events/${event.id}/options`, "POST", {
          ...body,
          variants: x.variants.split("\n").map((v) => v.trim()).filter(Boolean).map((label) => ({ label })),
        }, "Option ajoutée");
    if (ok) setEditing(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Options</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing({ id: null, draft: emptyDraft })}>
          <Plus className="size-4" aria-hidden="true" /> Ajouter une option
        </Button>
      </div>
      {event.options.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Aucune option : un concert peut s&apos;en passer.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {event.options.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-ink">
                  {o.label} — {o.price > 0 ? formatEuros(o.price) : "gratuit"}
                </p>
                <p className="text-[13px] text-ink-muted">
                  {OPTION_TYPE_LABEL[o.type]} · {OPTION_SCOPE_LABEL[o.scope]}
                  {o.pickup ? " · à retirer sur place" : ""}
                  {o.namedPrep ? " · étiquettes" : ""} · {o.used} réservé{o.used > 1 ? "s" : ""}
                  {o.stock !== null ? ` / ${o.stock}` : ""}
                </p>
                {o.variants.length > 0 && <p className="text-[13px] text-ink-muted">Menu : {o.variants.map((v) => v.label).join(", ")}</p>}
              </div>
              <div className="flex items-center gap-2">
                {!o.active && <StatusChip>Désactivée</StatusChip>}
                <Button type="button" size="sm" variant="ghost" aria-label={`Modifier ${o.label}`} onClick={() => setEditing({ id: o.id, draft: draftOf(o) })}>
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Supprimer ${o.label}`}
                  disabled={busy}
                  onClick={() => call(`/api/ticketing/events/${event.id}/options/${o.id}`, "DELETE", undefined, o.used > 0 ? "Option désactivée" : "Option supprimée")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && d && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Modifier l'option" : "Nouvelle option"} size="lg">
          <div className="space-y-3">
            <Input label="Libellé" value={d.label} onChange={(e) => set("label", e.target.value)} />
            <Input label="Description (facultative)" value={d.description} onChange={(e) => set("description", e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Type" value={d.type} options={OPTION_TYPES.map((t) => ({ value: t, label: OPTION_TYPE_LABEL[t] }))} onChange={(e) => set("type", e.target.value as TicketingOptionType)} />
              <Select label="Portée" value={d.scope} options={OPTION_SCOPES.map((s) => ({ value: s, label: OPTION_SCOPE_LABEL[s] }))} onChange={(e) => set("scope", e.target.value as TicketingOptionScope)} />
              <Input label="Prix (€)" inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value)} />
              <Input label="Stock (vide = illimité)" type="number" min={0} value={d.stock} onChange={(e) => set("stock", e.target.value)} />
            </div>
            {!editing.id && d.type === "CHOICE" && (
              <label className="block space-y-1">
                <span className="text-[13px] font-medium text-ink">Plats ou variantes (un par ligne, facultatif)</span>
                <textarea
                  className="w-full rounded-control border border-control-line bg-surface p-2 text-[15px] text-ink"
                  rows={3}
                  value={d.variants}
                  onChange={(e) => set("variants", e.target.value)}
                />
                <span className="text-[13px] text-ink-muted">La restauration peut composer et compléter le menu ensuite.</span>
              </label>
            )}
            <Flag label="À retirer sur place (distribution par la restauration)" checked={d.pickup} onChange={(v) => set("pickup", v)} />
            {d.pickup && <Flag label="Préparation nominative (une étiquette par repas)" checked={d.namedPrep} onChange={(v) => set("namedPrep", v)} />}
            <Flag label="Remboursable en cas d'annulation" checked={d.refundable} onChange={(v) => set("refundable", v)} />
            {d.refundable && <Input label="Date limite de remboursement (facultative)" type="datetime-local" value={d.refundDeadline} onChange={(e) => set("refundDeadline", e.target.value)} />}
            {editing.id && <Flag label="Proposée aux inscrits" checked={d.active} onChange={(v) => set("active", v)} />}
            <Button type="button" disabled={busy || !d.label.trim()} onClick={save}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
