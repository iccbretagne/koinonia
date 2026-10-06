"use client";

import { useEffect, useState } from "react";

export interface AssigneeValue {
  kind: "PROFILE" | "MEMBER";
  id: string;
}

interface Profile { id: string; name: string; role: string; userId: string | null }
interface Companion { id: string; name: string | null; email: string | null }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

/**
 * Sélecteur d'accompagnant à deux groupes — profils pastoraux et STAR accompagnants (spec 052,
 * T50 ; spec 056, vivier MSDP + exceptions déclarées). Un profil sans compte porte la mention
 * « pas de compte : prévenu par email seulement ».
 */
export default function AssigneeSelect({ id, churchId, value, onChange }: {
  readonly id?: string;
  readonly churchId: string;
  readonly value: AssigneeValue | null;
  readonly onChange: (value: AssigneeValue | null) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/care/companions?churchId=${churchId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setProfiles(data?.profiles ?? []);
        setCompanions(data?.members ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId]);

  const selectValue = value ? `${value.kind}:${value.id}` : "";

  return (
    <select
      id={id}
      value={selectValue}
      disabled={loading}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw) { onChange(null); return; }
        const [kind, id] = raw.split(":");
        onChange({ kind: kind as "PROFILE" | "MEMBER", id });
      }}
      className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand"
    >
      <option value="">{loading ? "Chargement…" : "— Sélectionner —"}</option>
      <optgroup label="Profils pastoraux">
        {profiles.map((p) => (
          <option key={p.id} value={`PROFILE:${p.id}`}>
            {p.name} ({ROLE_LABELS[p.role] ?? p.role}){!p.userId ? " — pas de compte, prévenu par email seulement" : ""}
          </option>
        ))}
      </optgroup>
      <optgroup label="STAR accompagnants">
        {companions.length === 0 ? (
          <option disabled value="">Aucun STAR accompagnant — voir Paramètres</option>
        ) : (
          companions.map((m) => (
            <option key={m.id} value={`MEMBER:${m.id}`}>{m.name ?? m.email}</option>
          ))
        )}
      </optgroup>
    </select>
  );
}
