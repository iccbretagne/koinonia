"use client";

import { useState } from "react";
import CheckboxGroup from "@/components/ui/CheckboxGroup";
import { DEPT_FN_LABEL, type DeptFunction } from "@/lib/department-functions";

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
  {
    key: "PROTOCOLE" as const,
    label: "Protocole",
    description: "Gère l'agenda pastoral et planifie les rendez-vous.",
    icon: "📅",
  },
  {
    key: "INTEGRATION" as const,
    label: "Intégration",
    description: "Traite les demandes d'intégration dans les familles d'impact.",
    icon: "🤝",
  },
  {
    key: "MSDP" as const,
    label: "Soins Pastoraux (MSDP)",
    description: "Assure le suivi des nouveaux convertis (appel au salut). Les membres sont proposés comme conseillers dans le workflow MSDP.",
    icon: "🕊️",
  },
  {
    key: "CAPTATION_AUDIO" as const,
    label: "Captation Audio",
    description: "Enregistre et dépose les cultes ; ses membres accèdent à l'espace Audio (spec 021).",
    icon: "🎙️",
  },
  {
    key: "MODERATION" as const,
    label: "Modération",
    description: "Anime le culte ; ses membres STAR accèdent à la trame des annonces.",
    icon: "🎤",
  },
  {
    key: "SECURITE" as const,
    label: "Sécurité",
    description: "Ses responsables désignent les personnes d'ouverture et de fermeture des cultes.",
    icon: "🔐",
  },
];

type FnKey = (typeof FUNCTIONS)[number]["key"];

export default function DeptFunctionsClient({ departments }: Props) {
  const [depts, setDepts] = useState(departments);
  const [saving, setSaving] = useState<string | null>(null);

  function getAssigned(fn: FnKey) {
    return depts.filter((d) => d.function === fn).map((d) => d.id);
  }

  async function patchDept(id: string, fn: string | null) {
    const res = await fetch(`/api/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ function: fn }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Erreur");
    }
  }

  async function handleChange(fn: FnKey, newSelection: string[]) {
    setSaving(fn);
    const prevSelection = getAssigned(fn);
    const toAssign = newSelection.filter((id) => !prevSelection.includes(id));
    const toUnassign = prevSelection.filter((id) => !newSelection.includes(id));

    try {
      await Promise.all([
        ...toAssign.map((id) => patchDept(id, fn)),
        ...toUnassign.map((id) => patchDept(id, null)),
      ]);

      setDepts((prev) =>
        prev.map((d) => {
          if (toAssign.includes(d.id)) return { ...d, function: fn };
          if (toUnassign.includes(d.id)) return { ...d, function: null };
          return d;
        })
      );
    } catch (e) {
      alert((e as Error).message || "Erreur lors de la mise à jour");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FUNCTIONS.map((fn) => {
            const assigned = getAssigned(fn.key);
            const isSaving = saving === fn.key;
            const assignedNames = depts
              .filter((d) => assigned.includes(d.id))
              .map((d) => d.name)
              .sort((a, b) => a.localeCompare(b));

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

                <CheckboxGroup
                  label="Départements assignés"
                  selected={assigned}
                  onChange={(selection) => handleChange(fn.key, selection)}
                  options={depts.map((d) => {
                    const carriesOtherFunction = d.function !== null && d.function !== fn.key;
                    return {
                      value: d.id,
                      label: carriesOtherFunction
                        ? `${d.name} (${d.ministryName}) — déjà ${DEPT_FN_LABEL[d.function as DeptFunction] ?? d.function}`
                        : `${d.name} (${d.ministryName})`,
                      disabled: isSaving || carriesOtherFunction,
                    };
                  })}
                />

                {assignedNames.length > 0 ? (
                  <p className="mt-2 text-xs text-icc-violet font-medium">
                    ✓ {assignedNames.join(", ")}
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
    </div>
  );
}
