"use client";

import { useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";

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
  { key: "integratedInFamily", label: "Famille", color: "bg-blue-100 text-blue-800" },
  { key: "followsPcnc", label: "PCNC", color: "bg-purple-100 text-purple-800" },
  { key: "isStar", label: "Service", color: "bg-green-100 text-green-800" },
  { key: "inDiscipleship", label: "Discipolat", color: "bg-orange-100 text-orange-800" },
] as const;

type MilestoneKey = (typeof MILESTONES)[number]["key"];

function milestoneCount(j: Journey): number {
  return [j.integratedInFamily, j.followsPcnc, j.isStar, j.inDiscipleship].filter(Boolean).length;
}

function JourneyMilestoneBadges({ journey }: { journey: Journey }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {MILESTONES.map((m) => (
        <span
          key={m.key}
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            journey[m.key] ? m.color : "bg-gray-100 text-gray-400"
          }`}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}

type Props = {
  churchId: string;
  initialJourneys: Journey[];
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
      setJourneys((prev) => [json.data, ...prev]);
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
      const updated: Journey = json.data;
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parcours</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Suivi des jalons d&apos;intégration pour chaque personne
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Nouveau dossier</Button>
      </div>

      {/* Filtres par jalon manquant */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
            filter === "ALL"
              ? "border-icc-violet bg-icc-violet text-white"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
        >
          Tous ({filterCounts.ALL})
        </button>
        {MILESTONES.map((m) => (
          <button
            key={m.key}
            onClick={() => setFilter(m.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
              filter === m.key
                ? "border-icc-violet bg-icc-violet text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            Sans {m.label} ({filterCounts[m.key]})
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="mb-4">
        <Input
          placeholder="Rechercher par nom, téléphone ou email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <p className="text-gray-400 text-center py-12">Aucun dossier trouvé.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => (
            <button
              key={j.id}
              onClick={() => setSelected(j)}
              className="w-full text-left bg-white border-2 border-gray-100 rounded-lg px-4 py-3 hover:border-icc-violet transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {j.firstName} {j.lastName}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {j.phone ?? j.email ?? "Aucun contact"}
                    {j.sourceRequest?.assignedFamilyName && (
                      <span className="ml-2 text-blue-600">
                        · {j.sourceRequest.assignedFamilyName}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <JourneyMilestoneBadges journey={j} />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-gray-100">
                  {[...Array(milestoneCount(j))].map((_, i) => (
                    <div key={i} className="flex-1 bg-icc-violet" />
                  ))}
                  {[...Array(4 - milestoneCount(j))].map((_, i) => (
                    <div key={i} className="flex-1" />
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modale détail */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`${selected.firstName} ${selected.lastName}`}>
          <div className="p-6 space-y-6 min-w-[320px]">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {selected.firstName} {selected.lastName}
              </h2>
              {(selected.phone || selected.email) && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {[selected.phone, selected.email].filter(Boolean).join(" · ")}
                </p>
              )}
              {selected.sourceRequest && (
                <a
                  href={`/integration/requests/${selected.sourceRequest.id}`}
                  className="text-xs text-icc-violet hover:underline mt-1 block"
                >
                  Voir la demande d&apos;intégration →
                </a>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Jalons</h3>
              <div className="space-y-2">
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
                    <div
                      key={m.key}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            reached
                              ? "bg-icc-violet border-icc-violet"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {reached && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{m.label}</p>
                          {reached && dateVal && (
                            <p className="text-xs text-gray-400">
                              {new Date(dateVal).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleMilestone(selected, m.key)}
                        className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                          reached
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-icc-violet text-icc-violet hover:bg-purple-50"
                        }`}
                      >
                        {reached ? "Retirer" : "Atteint"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {selected.notes && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Notes</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selected.notes}</p>
              </div>
            )}

            <div className="text-xs text-gray-400">
              Dossier créé le {new Date(selected.createdAt).toLocaleDateString("fr-FR")}
            </div>
          </div>
        </Modal>
      )}

      {/* Modale création */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau dossier parcours">
        <div className="p-6 space-y-4 min-w-[320px]">
          <h2 className="text-xl font-bold text-gray-900">Nouveau dossier parcours</h2>
          {createError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {createError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Prénom *"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
            <Input
              placeholder="Nom *"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <Input
            placeholder="Téléphone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <textarea
            placeholder="Notes (optionnel)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full border-2 border-gray-200 rounded-lg p-3 text-sm focus:border-icc-violet focus:outline-none resize-none"
          />
          <div className="flex gap-3 justify-end">
            <Button onClick={() => setShowCreate(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Création…" : "Créer le dossier"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
