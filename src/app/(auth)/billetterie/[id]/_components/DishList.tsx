"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, IconButton, Input, StatusChip } from "@/components/ui";
import { useApi } from "../../use-api";

export interface Dish {
  id: string;
  label: string;
  description: string | null;
  allergens: string | null;
  stock: number | null;
  prepared: number | null;
  closed: boolean;
  used: number;
}

const num = (v: string) => (v === "" ? null : Number(v));

function summary(d: Dish, showPrepared: boolean): string {
  const parts = [`${d.used} réservé${d.used > 1 ? "s" : ""}${d.stock === null ? "" : ` / ${d.stock}`}`];
  if (showPrepared && d.prepared !== null) parts.push(`${d.prepared} préparé${d.prepared > 1 ? "s" : ""}`);
  if (d.allergens) parts.push(`allergènes : ${d.allergens}`);
  return parts.join(" · ");
}

/** Un plat : une ligne compacte, qui s'ouvre en formulaire au toucher de « Modifier ». */
function DishRow({ eventId, dish, showPrepared }: { readonly eventId: string; readonly dish: Dish; readonly showPrepared: boolean }) {
  const { call, busy } = useApi();
  const [draft, setDraft] = useState<Dish | null>(null);
  const url = `/api/ticketing/events/${eventId}/variants/${dish.id}`;

  if (!draft) {
    return (
      <li className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0">
          <span className={`text-[15px] ${dish.closed ? "text-ink-muted line-through" : "text-ink"}`}>{dish.label}</span>
          {dish.closed && (
            <StatusChip tone="neutral" className="ml-2">
              Fermé
            </StatusChip>
          )}
          <span className="block text-[13px] text-ink-muted">{summary(dish, showPrepared)}</span>
        </span>
        <IconButton icon={Pencil} aria-label={`Modifier ${dish.label}`} onClick={() => setDraft(dish)} />
      </li>
    );
  }

  const set = (patch: Partial<Dish>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  async function save() {
    if (!draft) return;
    const ok = await call(
      url,
      "PATCH",
      {
        label: draft.label,
        description: draft.description,
        allergens: draft.allergens,
        stock: draft.stock,
        ...(showPrepared ? { prepared: draft.prepared } : {}),
        closed: draft.closed,
      },
      "Plat enregistré"
    );
    if (ok) setDraft(null);
  }
  return (
    <li className="space-y-3 bg-surface-sunken px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Plat" value={draft.label} maxLength={120} onChange={(e) => set({ label: e.target.value })} />
        <Input label="Allergènes" value={draft.allergens ?? ""} maxLength={200} onChange={(e) => set({ allergens: e.target.value || null })} />
        <Input label="Description (facultative)" value={draft.description ?? ""} maxLength={300} onChange={(e) => set({ description: e.target.value || null })} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Stock"
            hint={`${dish.used} réservé${dish.used > 1 ? "s" : ""} ; vide = illimité`}
            type="number"
            min={dish.used}
            value={draft.stock ?? ""}
            onChange={(e) => set({ stock: num(e.target.value) })}
          />
          {showPrepared && <Input label="Préparés" type="number" min={0} value={draft.prepared ?? ""} onChange={(e) => set({ prepared: num(e.target.value) })} />}
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox checked={draft.closed} onChange={(e) => set({ closed: e.target.checked })} />
        <span className="text-[15px] text-ink">Fermé aux nouvelles commandes</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy || !draft.label.trim()} onClick={save}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setDraft(null)}>
          Annuler
        </Button>
        {dish.used === 0 ? (
          <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => call(url, "DELETE", undefined, "Plat supprimé")}>
            <Trash2 className="size-4" aria-hidden="true" /> Supprimer
          </Button>
        ) : (
          <span className="ml-auto text-[13px] text-ink-muted">Déjà réservé : fermez-le plutôt que de le supprimer.</span>
        )}
      </div>
    </li>
  );
}

/** Plats d'une option à choix : liste compacte, modification sur place, ajout d'un plat. */
export default function DishList({
  eventId,
  optionId,
  dishes,
  showPrepared = false,
}: {
  readonly eventId: string;
  readonly optionId: string;
  readonly dishes: Dish[];
  readonly showPrepared?: boolean;
}) {
  const { call, busy } = useApi();
  const [label, setLabel] = useState("");
  async function add() {
    if (await call(`/api/ticketing/events/${eventId}/options/${optionId}/variants`, "POST", { label: label.trim() }, "Plat ajouté")) setLabel("");
  }
  return (
    <div className="space-y-2">
      {dishes.length === 0 ? (
        <p className="text-[13px] text-warning">Aucun plat : ajoutez-en au moins un pour que les inscrits puissent choisir.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
          {dishes.map((d) => (
            <DishRow key={d.id} eventId={eventId} dish={d} showPrepared={showPrepared} />
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void add();
        }}
      >
        <div className="min-w-0 flex-1">
          <Input label="Nouveau plat" placeholder="Poulet yassa, végétarien…" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" disabled={busy || !label.trim()}>
          <Plus className="size-4" aria-hidden="true" /> Ajouter
        </Button>
      </form>
    </div>
  );
}
