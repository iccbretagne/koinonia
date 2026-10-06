"use client";

import { useState, useEffect, useCallback } from "react";
import Button from "@/components/ui/Button";

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
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
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
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      await fetchPool();
    } finally {
      setRemoving(null);
    }
  }

  async function removeFamily(f: PoolFamily) {
    if (!confirm(`Supprimer ${f.familyName} du pool ?`)) return;
    setRemoving(f.id);
    try {
      const res = await fetch(`/api/welcome-duty/families/${f.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
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
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {active.length} famille{active.length !== 1 ? "s" : ""} dans le pool de rotation
        </p>
        <Button onClick={openPicker}>+ Ajouter une famille</Button>
      </div>

      {loadingPool && <p className="text-sm text-ink-subtle">Chargement…</p>}
      {!loadingPool && active.length === 0 && (
        <div className="text-center py-12 bg-surface rounded-lg border border-dashed border-line">
          <p className="text-ink-subtle text-sm">Aucune famille dans le pool.</p>
          <p className="text-ink-subtle text-xs mt-1">Ajoutez des familles pour commencer la rotation.</p>
        </div>
      )}
      {!loadingPool && active.length > 0 && (
        <div className="bg-surface rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase">Famille</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase">Dernier service</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {active.map((f) => (
                <tr key={f.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3 font-medium text-ink">{f.familyName}</td>
                  <td className="px-4 py-3 text-ink-muted">{lastServed(f)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeFamily(f)}
                      disabled={removing === f.id}
                      className="text-xs text-danger hover:text-danger disabled:opacity-50"
                    >
                      Retirer
                    </button>
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
          <h3 className="text-sm font-semibold text-ink-muted mb-3">Familles désactivées</h3>
          <div className="bg-surface rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {inactive.map((f) => (
                  <tr key={f.id} className="opacity-50 hover:opacity-80">
                    <td className="px-4 py-3 font-medium text-ink">{f.familyName}</td>
                    <td className="px-4 py-3 text-ink-muted">{lastServed(f)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(f)}
                        disabled={removing === f.id}
                        className="text-xs text-brand-text hover:text-brand-text disabled:opacity-50 mr-3"
                      >
                        Réactiver
                      </button>
                      <button
                        onClick={() => removeFamily(f)}
                        disabled={removing === f.id}
                        className="text-xs text-danger hover:text-danger disabled:opacity-50"
                      >
                        Supprimer
                      </button>
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
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="bg-surface rounded-xl shadow-overlay w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">Ajouter une famille au pool</h3>
              <button onClick={() => setShowPicker(false)} className="text-ink-subtle hover:text-ink-muted">✕</button>
            </div>
            <div className="px-5 py-3 border-b border-line">
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loadingAvailable && <p className="text-center text-sm text-ink-subtle py-8">Chargement…</p>}
              {!loadingAvailable && filtered.length === 0 && (
                <p className="text-center text-sm text-ink-subtle py-8">Aucune famille disponible</p>
              )}
              {!loadingAvailable && filtered.length > 0 &&
                filtered.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => addFamily(f)}
                    disabled={adding === f.id}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-muted hover:bg-brand-soft disabled:opacity-50 flex items-center justify-between"
                  >
                    <span>{f.name}</span>
                    {adding === f.id && <span className="text-xs text-ink-subtle">Ajout…</span>}
                  </button>
                ))}
            </div>
            <div className="px-5 py-3 border-t border-line">
              <Button variant="secondary" onClick={() => setShowPicker(false)} className="w-full">
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
