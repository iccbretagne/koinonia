"use client";

import { useEffect, useState } from "react";

export interface AssigneeValue {
  kind: "PROFILE" | "MEMBER";
  id: string;
}

interface Profile { id: string; name: string; role: string; userId: string | null }
interface MsdpMember { id: string; name: string | null; email: string | null }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

/**
 * Sélecteur d'accompagnant à deux groupes — profils pastoraux et membres du MSDP (spec 052,
 * T50). Un profil sans compte porte la mention « pas de compte : prévenu par email seulement ».
 */
export default function AssigneeSelect({ churchId, value, onChange }: {
  readonly churchId: string;
  readonly value: AssigneeValue | null;
  readonly onChange: (value: AssigneeValue | null) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [msdpMembers, setMsdpMembers] = useState<MsdpMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/care/companions?churchId=${churchId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setProfiles(data?.profiles ?? []);
        setMsdpMembers(data?.msdpMembers ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId]);

  const selectValue = value ? `${value.kind}:${value.id}` : "";

  return (
    <select
      value={selectValue}
      disabled={loading}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw) { onChange(null); return; }
        const [kind, id] = raw.split(":");
        onChange({ kind: kind as "PROFILE" | "MEMBER", id });
      }}
      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
    >
      <option value="">{loading ? "Chargement…" : "— Sélectionner —"}</option>
      <optgroup label="Profils pastoraux">
        {profiles.map((p) => (
          <option key={p.id} value={`PROFILE:${p.id}`}>
            {p.name} ({ROLE_LABELS[p.role] ?? p.role}){!p.userId ? " — pas de compte, prévenu par email seulement" : ""}
          </option>
        ))}
      </optgroup>
      <optgroup label="Membres du MSDP">
        {msdpMembers.map((m) => (
          <option key={m.id} value={`MEMBER:${m.id}`}>{m.name ?? m.email}</option>
        ))}
      </optgroup>
    </select>
  );
}
