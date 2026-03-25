"use client";

import { useState } from "react";

interface Department {
  id: string;
  name: string;
  ministryName: string;
  function: string | null;
}

interface Props {
  departments: Department[];
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

export default function DeptFunctionsClient({ departments }: Props) {
  const [depts, setDepts] = useState(departments);
  const [saving, setSaving] = useState<string | null>(null);

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

  const grouped = depts.reduce(
    (acc, d) => {
      if (!acc[d.ministryName]) acc[d.ministryName] = [];
      acc[d.ministryName].push(d);
      return acc;
    },
    {} as Record<string, Department[]>
  );

  return (
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
  );
}
