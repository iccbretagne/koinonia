"use client";

import { useState } from "react";
import { isSystemFunction } from "@/lib/department-functions";

interface Department {
  id: string;
  name: string;
  ministryName: string;
  function: string | null;
}

interface Props {
  departments: Department[];
  initialCustomFunctions: string[];
}

const FUNCTIONS = [
  {
    key: "SECRETARIAT" as const,
    label: "Secrétariat",
    description: "Traite les demandes de diffusion interne lors des événements.",
    icon: "📋",
  },
  {
    key: "COMMUNICATION" as const,
    label: "Communication",
    description: "Publie les annonces sur les réseaux sociaux.",
    icon: "📣",
  },
  {
    key: "PRODUCTION_MEDIA" as const,
    label: "Production Média",
    description: "Crée les visuels pour toutes les demandes.",
    icon: "🎨",
  },
];

export default function DeptFunctionsClient({ departments, initialCustomFunctions }: Props) {
  const [depts, setDepts] = useState(departments);
  const [saving, setSaving] = useState<string | null>(null);

  // Custom functions state
  const [customFunctions, setCustomFunctions] = useState<string[]>(initialCustomFunctions);
  const [newFnName, setNewFnName] = useState("");
  const [newFnDeptId, setNewFnDeptId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function getAssigned(fn: "SECRETARIAT" | "COMMUNICATION" | "PRODUCTION_MEDIA") {
    return depts.find((d) => d.function === fn)?.id ?? "";
  }

  async function handleChange(
    fn: "SECRETARIAT" | "COMMUNICATION" | "PRODUCTION_MEDIA",
    newDeptId: string
  ) {
    setSaving(fn);
    const prevDeptId = getAssigned(fn);

    try {
      // Unassign previous if different
      if (prevDeptId && prevDeptId !== newDeptId) {
        await fetch(`/api/departments/${prevDeptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ function: null }),
        });
      }

      // Assign new (or clear if empty)
      if (newDeptId) {
        const res = await fetch(`/api/departments/${newDeptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ function: fn }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Erreur");
          return;
        }
      }

      setDepts((prev) =>
        prev.map((d) => {
          if (d.id === prevDeptId) return { ...d, function: null };
          if (d.id === newDeptId) return { ...d, function: fn };
          return d;
        })
      );
    } catch {
      alert("Erreur lors de la mise à jour");
    } finally {
      setSaving(null);
    }
  }

  async function handleCustomChange(fnKey: string, newDeptId: string) {
    setSaving(fnKey);
    const prevDept = depts.find((d) => d.function === fnKey);
    const prevDeptId = prevDept?.id ?? "";

    try {
      if (prevDeptId && prevDeptId !== newDeptId) {
        await fetch(`/api/departments/${prevDeptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ function: null }),
        });
      }

      if (newDeptId) {
        const res = await fetch(`/api/departments/${newDeptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ function: fnKey }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Erreur");
          return;
        }
      }

      setDepts((prev) =>
        prev.map((d) => {
          if (d.id === prevDeptId) return { ...d, function: null };
          if (d.id === newDeptId) return { ...d, function: fnKey };
          return d;
        })
      );
    } catch {
      alert("Erreur lors de la mise à jour");
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteCustom(fnKey: string) {
    const dept = depts.find((d) => d.function === fnKey);
    setSaving(`delete:${fnKey}`);

    try {
      if (dept) {
        const res = await fetch(`/api/departments/${dept.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ function: null }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Erreur lors de la suppression");
          return;
        }
        setDepts((prev) =>
          prev.map((d) => (d.id === dept.id ? { ...d, function: null } : d))
        );
      }
      setCustomFunctions((prev) => prev.filter((f) => f !== fnKey));
    } catch {
      alert("Erreur lors de la suppression");
    } finally {
      setSaving(null);
    }
  }

  async function handleCreate() {
    setCreateError(null);
    const trimmedName = newFnName.trim().toUpperCase().replace(/\s+/g, "_");

    if (!trimmedName) {
      setCreateError("Le nom est requis.");
      return;
    }

    if (isSystemFunction(trimmedName)) {
      setCreateError("Ce nom est réservé à une fonction système.");
      return;
    }

    if (customFunctions.includes(trimmedName)) {
      setCreateError("Cette fonction personnalisée existe déjà.");
      return;
    }

    if (!newFnDeptId) {
      setCreateError("Veuillez choisir un département.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`/api/departments/${newFnDeptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ function: trimmedName }),
      });

      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Erreur lors de la création");
        return;
      }

      setDepts((prev) =>
        prev.map((d) => {
          // Clear previous holder of this function (handled server-side, but update local state)
          if (d.function === trimmedName && d.id !== newFnDeptId) return { ...d, function: null };
          if (d.id === newFnDeptId) return { ...d, function: trimmedName };
          return d;
        })
      );

      setCustomFunctions((prev) => [...prev, trimmedName].sort());
      setNewFnName("");
      setNewFnDeptId("");
    } catch {
      setCreateError("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  }

  const grouped = depts.reduce(
    (acc, d) => {
      if (!acc[d.ministryName]) acc[d.ministryName] = [];
      acc[d.ministryName].push(d);
      return acc;
    },
    {} as Record<string, Department[]>
  );

  return (
    <div className="space-y-10">
      {/* System functions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Fonctions système
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FUNCTIONS.map((fn) => {
            const assigned = getAssigned(fn.key);
            const isSaving = saving === fn.key;

            return (
              <div
                key={fn.key}
                className="bg-white rounded-lg shadow p-5 border-2 border-transparent hover:border-icc-violet/20 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{fn.icon}</span>
                  <h3 className="font-semibold text-gray-900">{fn.label}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">{fn.description}</p>

                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Département assigné
                </label>
                <select
                  value={assigned}
                  onChange={(e) => handleChange(fn.key, e.target.value)}
                  disabled={isSaving}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet focus:ring-1 focus:ring-icc-violet disabled:opacity-50 bg-white"
                >
                  <option value="">— Non configuré —</option>
                  {Object.entries(grouped).map(([ministry, deps]) => (
                    <optgroup key={ministry} label={ministry}>
                      {deps.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {d.function && d.function !== fn.key
                            ? ` (${d.function})`
                            : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {assigned ? (
                  <p className="mt-2 text-xs text-icc-violet font-medium">
                    ✓ {depts.find((d) => d.id === assigned)?.name}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-600">
                    ⚠ Aucun département configuré — les demandes ne seront pas assignées automatiquement
                  </p>
                )}

                {isSaving && (
                  <p className="mt-1 text-xs text-gray-400">Enregistrement...</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom functions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Fonctions personnalisées
        </h2>

        {customFunctions.length === 0 && (
          <p className="text-sm text-gray-400 mb-6">Aucune fonction personnalisée configurée.</p>
        )}

        {customFunctions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {customFunctions.map((fnKey) => {
              const assignedDept = depts.find((d) => d.function === fnKey);
              const assignedId = assignedDept?.id ?? "";
              const isSaving = saving === fnKey;
              const isDeleting = saving === `delete:${fnKey}`;

              return (
                <div
                  key={fnKey}
                  className="bg-white rounded-lg shadow p-5 border-2 border-transparent hover:border-icc-violet/20 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔧</span>
                      <h3 className="font-semibold text-gray-900">{fnKey}</h3>
                    </div>
                    <button
                      onClick={() => handleDeleteCustom(fnKey)}
                      disabled={isDeleting || isSaving}
                      title="Supprimer cette fonction"
                      className="text-gray-400 hover:text-icc-rouge disabled:opacity-40 transition-colors text-lg leading-none"
                    >
                      🗑️
                    </button>
                  </div>

                  <label className="block text-xs font-medium text-gray-700 mb-1 mt-4">
                    Département assigné
                  </label>
                  <select
                    value={assignedId}
                    onChange={(e) => handleCustomChange(fnKey, e.target.value)}
                    disabled={isSaving || isDeleting}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet focus:ring-1 focus:ring-icc-violet disabled:opacity-50 bg-white"
                  >
                    <option value="">— Non configuré —</option>
                    {Object.entries(grouped).map(([ministry, deps]) => (
                      <optgroup key={ministry} label={ministry}>
                        {deps.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                            {d.function && d.function !== fnKey
                              ? ` (${d.function})`
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {assignedId ? (
                    <p className="mt-2 text-xs text-icc-violet font-medium">
                      ✓ {assignedDept?.name}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-600">
                      ⚠ Aucun département configuré
                    </p>
                  )}

                  {(isSaving || isDeleting) && (
                    <p className="mt-1 text-xs text-gray-400">
                      {isDeleting ? "Suppression..." : "Enregistrement..."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add custom function form */}
        <div className="bg-white rounded-lg shadow p-5 border-2 border-dashed border-gray-200 max-w-md">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Ajouter une fonction</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nom
              </label>
              <input
                type="text"
                value={newFnName}
                onChange={(e) => {
                  setNewFnName(e.target.value);
                  setCreateError(null);
                }}
                placeholder="ex : TECHNIQUE"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet focus:ring-1 focus:ring-icc-violet"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Département
              </label>
              <select
                value={newFnDeptId}
                onChange={(e) => {
                  setNewFnDeptId(e.target.value);
                  setCreateError(null);
                }}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet focus:ring-1 focus:ring-icc-violet bg-white"
              >
                <option value="">— Choisir —</option>
                {Object.entries(grouped).map(([ministry, deps]) => (
                  <optgroup key={ministry} label={ministry}>
                    {deps.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.function ? ` (${d.function})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {createError && (
              <p className="text-xs text-icc-rouge">{createError}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-icc-violet text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Création..." : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
