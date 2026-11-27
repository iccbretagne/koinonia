"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, ChevronRight, Plus } from "lucide-react";
import { Alert, Button, EmptyState, FilterChip, Input, Modal, PageHeader, SearchInput, StatusChip, Textarea, buttonClasses, type StatusTone } from "@/components/ui";

export type SourceRequest = {
  id: string;
  status: string;
  assignedFamilyName: string | null;
};

export type Journey = {
  id: string;
  churchId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  integratedInFamily: boolean;
  familyIntegratedAt: string | null;
  followsPcnc: boolean;
  pcncStartedAt: string | null;
  isStar: boolean;
  starSince: string | null;
  inDiscipleship: boolean;
  discipleshipSince: string | null;
  notes: string | null;
  sourceRequest: SourceRequest | null;
  createdAt: string;
};

const MILESTONES = [
  { key: "integratedInFamily", label: "Famille", tone: "info" },
  { key: "followsPcnc", label: "PCNC", tone: "brand" },
  { key: "isStar", label: "Service", tone: "success" },
  { key: "inDiscipleship", label: "Discipolat", tone: "warning" },
] as const satisfies readonly { key: string; label: string; tone: StatusTone }[];

type MilestoneKey = (typeof MILESTONES)[number]["key"];

function milestoneCount(j: Journey): number {
  return [j.integratedInFamily, j.followsPcnc, j.isStar, j.inDiscipleship].filter(Boolean).length;
}

function JourneyMilestoneBadges({ journey }: { readonly journey: Journey }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MILESTONES.map((m) => (
        <StatusChip key={m.key} tone={journey[m.key] ? m.tone : "neutral"}>
          {m.label}
          <span className="sr-only">{journey[m.key] ? " (atteint)" : " (non atteint)"}</span>
        </StatusChip>
      ))}
    </div>
  );
}

type Props = {
  readonly churchId: string;
  readonly initialJourneys: Journey[];
};

export default function ParcoursView({ churchId, initialJourneys }: Props) {
  const [journeys, setJourneys] = useState<Journey[]>(initialJourneys);
  const [filter, setFilter] = useState<"ALL" | MilestoneKey>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Journey | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaire de création
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const filtered = journeys.filter((j) => {
    const matchFilter =
      filter === "ALL" ||
      (filter === "integratedInFamily" && !j.integratedInFamily) ||
      (filter === "followsPcnc" && !j.followsPcnc) ||
      (filter === "isStar" && !j.isStar) ||
      (filter === "inDiscipleship" && !j.inDiscipleship);
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      j.firstName.toLowerCase().includes(q) ||
      j.lastName.toLowerCase().includes(q) ||
      (j.phone ?? "").includes(q) ||
      (j.email ?? "").toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const handleCreate = async () => {
    setCreateError(null);
    if (!form.firstName || !form.lastName) {
      setCreateError("Prénom et nom obligatoires");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integration/parcours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, churchId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setJourneys((prev) => [json, ...prev]);
      setShowCreate(false);
      setForm({ firstName: "", lastName: "", phone: "", email: "", notes: "" });
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const toggleMilestone = useCallback(
    async (journey: Journey, key: MilestoneKey) => {
      const newValue = !journey[key];
      const res = await fetch(`/api/integration/parcours/${journey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newValue }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const updated: Journey = json;
      setJourneys((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      if (selected?.id === updated.id) setSelected(updated);
    },
    [selected]
  );

  const filterCounts = {
    ALL: journeys.length,
    integratedInFamily: journeys.filter((j) => !j.integratedInFamily).length,
    followsPcnc: journeys.filter((j) => !j.followsPcnc).length,
    isStar: journeys.filter((j) => !j.isStar).length,
    inDiscipleship: journeys.filter((j) => !j.inDiscipleship).length,
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Parcours"
        description="Suivi des jalons d'intégration pour chaque personne."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Créer un dossier
          </Button>
        }
      />

      {/* Filtres par jalon manquant */}
      <div role="group" aria-label="Filtrer par jalon manquant" className="flex flex-wrap gap-2">
        <FilterChip pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
          Tous
          <span className="font-normal tabular-nums">{filterCounts.ALL}</span>
        </FilterChip>
        {MILESTONES.map((m) => (
          <FilterChip key={m.key} pressed={filter === m.key} onClick={() => setFilter(m.key)}>
            Sans {m.label}
            <span className="font-normal tabular-nums">{filterCounts[m.key]}</span>
          </FilterChip>
        ))}
      </div>

      {/* Recherche */}
      <SearchInput
        aria-label="Rechercher un dossier"
        placeholder="Rechercher par nom, téléphone ou email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-96"
      />

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState size="sm" title="Aucun dossier trouvé" />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => setSelected(j)}
                className="w-full rounded-card border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {j.firstName} {j.lastName}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {j.phone ?? j.email ?? "Aucun contact"}
                      {j.sourceRequest?.assignedFamilyName && <> · {j.sourceRequest.assignedFamilyName}</>}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <JourneyMilestoneBadges journey={j} />
                  </div>
                </div>
                <div
                  className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-line"
                  role="img"
                  aria-label={`${milestoneCount(j)} jalon${milestoneCount(j) > 1 ? "s" : ""} sur 4`}
                >
                  {Array.from({ length: milestoneCount(j) }, (_, i) => (
                    <div key={i} className="flex-1 bg-brand" />
                  ))}
                  {Array.from({ length: 4 - milestoneCount(j) }, (_, i) => (
                    <div key={i} className="flex-1" />
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Modale détail */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`${selected.firstName} ${selected.lastName}`}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              {(selected.phone || selected.email) && (
                <p className="text-sm text-ink-muted">
                  {[selected.phone, selected.email].filter(Boolean).join(" · ")}
                </p>
              )}
              {selected.sourceRequest && (
                <Link
                  href={`/integration/requests/${selected.sourceRequest.id}`}
                  className={`${buttonClasses("ghost", "sm")} -ml-3 min-h-11 self-start sm:min-h-9`}
                >
                  Voir la demande d&apos;intégration
                  <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </Link>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">Jalons</h3>
              <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
                {MILESTONES.map((m) => {
                  const reached = selected[m.key];
                  const dateKey = {
                    integratedInFamily: "familyIntegratedAt",
                    followsPcnc: "pcncStartedAt",
                    isStar: "starSince",
                    inDiscipleship: "discipleshipSince",
                  }[m.key] as keyof Journey;
                  const dateVal = selected[dateKey] as string | null;
                  return (
                    <li key={m.key} className="flex items-center justify-between gap-4 p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
                            reached ? "border-brand bg-brand text-on-brand" : "border-control-line bg-surface"
                          }`}
                        >
                          {reached && <Check aria-hidden="true" className="size-3" strokeWidth={3} />}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {m.label}
                            <span className="sr-only">{reached ? " (atteint)" : " (non atteint)"}</span>
                          </p>
                          {reached && dateVal && (
                            <p className="text-xs text-ink-muted">
                              {new Date(dateVal).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={reached ? "ghost" : "secondary"}
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        onClick={() => toggleMilestone(selected, m.key)}
                      >
                        {reached ? "Retirer le jalon" : "Marquer atteint"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {selected.notes && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink">Notes</h3>
                <p className="whitespace-pre-wrap text-sm text-ink-muted">{selected.notes}</p>
              </div>
            )}

            <p className="text-xs text-ink-muted">
              Dossier créé le {new Date(selected.createdAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </Modal>
      )}

      {/* Modale création */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau dossier parcours">
        <div className="flex flex-col gap-4">
          {createError && <Alert tone="danger">{createError}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Prénom"
              required
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
            <Input
              label="Nom"
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <Input
            label="Téléphone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Textarea
            label="Notes (facultatif)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Création en cours…" : "Créer le dossier"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
