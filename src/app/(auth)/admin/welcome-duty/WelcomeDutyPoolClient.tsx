"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button, EmptyState, Modal, SearchInput, SkeletonList, useToast } from "@/components/ui";
import { useConfirm } from "../use-confirm";

interface PoolFamily {
  id: string;
  familyId: number;
  familyName: string;
  active: boolean;
  assignments: { event: { id: string; title: string; date: string } }[];
}

interface ExternalFamily {
  id: number;
  name: string;
}

export default function WelcomeDutyPoolClient() {
  const [pool, setPool] = useState<PoolFamily[]>([]);
  const [available, setAvailable] = useState<ExternalFamily[]>([]);
  const [loadingPool, setLoadingPool] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<number | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmDialog, ask] = useConfirm();
  const toast = useToast();

  const fetchPool = useCallback(async () => {
    setLoadingPool(true);
    try {
      const res = await fetch("/api/welcome-duty/families?active=false");
      const data = await res.json();
      setPool(Array.isArray(data) ? data : []);
    } finally {
      setLoadingPool(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
  useEffect(() => { fetchPool().catch(() => undefined); }, [fetchPool]);

  async function openPicker() {
    setShowPicker(true);
    if (available.length === 0) {
      setLoadingAvailable(true);
      try {
        const res = await fetch("/api/welcome-duty/available-families");
        const data = await res.json();
        setAvailable(data.families ?? []);
      } finally {
        setLoadingAvailable(false);
      }
    }
  }

  async function addFamily(f: ExternalFamily) {
    setAdding(f.id);
    try {
      const res = await fetch("/api/welcome-duty/families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: f.id, familyName: f.name }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
      await fetchPool();
    } finally {
      setAdding(null);
    }
  }

  async function toggleActive(f: PoolFamily) {
    setRemoving(f.id);
    try {
      const res = await fetch(`/api/welcome-duty/families/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !f.active }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
      await fetchPool();
    } finally {
      setRemoving(null);
    }
  }

  async function removeFamily(f: PoolFamily) {
    const ok = await ask({
      title: `Supprimer ${f.familyName} du pool ?`,
      message: "La famille ne sera plus proposée dans la rotation ; ses services passés restent visibles.",
      confirmLabel: "Supprimer la famille",
    });
    if (!ok) return;
    setRemoving(f.id);
    try {
      const res = await fetch(`/api/welcome-duty/families/${f.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
      await fetchPool();
    } finally {
      setRemoving(null);
    }
  }

  const poolIds = new Set(pool.filter((f) => f.active).map((f) => f.familyId));
  const filtered = available.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) && !poolIds.has(f.id)
  );

  const active = pool.filter((f) => f.active);
  const inactive = pool.filter((f) => !f.active);

  function lastServed(f: PoolFamily) {
    if (!f.assignments.length) return "Jamais";
    return new Date(f.assignments[0].event.date).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {active.length} famille{active.length > 1 ? "s" : ""} dans le pool de rotation
        </p>
        <Button onClick={openPicker}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Ajouter une famille
        </Button>
      </div>

      {loadingPool && <SkeletonList rows={4} />}
      {!loadingPool && active.length === 0 && (
        <EmptyState title="Aucune famille dans le pool" description="Ajoutez des familles pour commencer la rotation." />
      )}
      {!loadingPool && active.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken border-b border-line">
              <tr>
                <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Famille</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Dernier service</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {active.map((f) => (
                <tr key={f.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3 font-medium text-ink">{f.familyName}</td>
                  <td className="px-4 py-3 text-ink-muted">{lastServed(f)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFamily(f)}
                      disabled={removing === f.id}
                    >
                      {removing === f.id ? "Retrait…" : "Retirer"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-display text-[17px] font-semibold leading-6 text-ink">Familles désactivées</h3>
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {inactive.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3 font-medium text-ink-muted">{f.familyName}</td>
                    <td className="px-4 py-3 text-ink-muted">{lastServed(f)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => toggleActive(f)} disabled={removing === f.id}>
                          Réactiver
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeFamily(f)} disabled={removing === f.id}>
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Picker modal */}
      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Ajouter une famille au pool">
        <div className="flex flex-col gap-3">
          <SearchInput
            aria-label="Rechercher une famille"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-[50vh] overflow-y-auto">
            {loadingAvailable && <SkeletonList rows={4} />}
            {!loadingAvailable && filtered.length === 0 && (
              <EmptyState size="sm" title="Aucune famille disponible" />
            )}
            {!loadingAvailable && filtered.length > 0 &&
              filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => addFamily(f)}
                  disabled={adding === f.id}
                  className="flex min-h-11 w-full items-center justify-between rounded-control px-3 py-2 text-left text-[15px] text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
                >
                  <span>{f.name}</span>
                  {adding === f.id && <span className="text-[13px] text-ink-muted">Ajout…</span>}
                </button>
              ))}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowPicker(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}
