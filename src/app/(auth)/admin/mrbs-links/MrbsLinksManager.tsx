"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface MrbsUserRow {
  mrbsUsername: string;
  mrbsDisplayName: string;
  mrbsEmail: string | null;
  mrbsLevel: number;
  linkedUserId: string | null;
  autoMatchUserId: string | null;
}

interface KoinoniaUser {
  id: string;
  email: string | null;
  name: string | null;
  displayName: string | null;
}

interface Props {
  mrbsUsers: MrbsUserRow[];
  koinoniaUsers: KoinoniaUser[];
  linkedByKoinonia: Record<string, string>;
  churchId: string;
  hasMrbsDb: boolean;
}

const LEVEL_LABELS: Record<number, string> = { 0: "Lecture", 1: "Utilisateur", 2: "Admin" };
const LEVEL_COLORS: Record<number, string> = {
  0: "bg-gray-100 text-gray-600",
  1: "bg-blue-100 text-blue-700",
  2: "bg-purple-100 text-purple-700",
};

export default function MrbsLinksManager({ mrbsUsers, koinoniaUsers, linkedByKoinonia, hasMrbsDb }: Props) {
  const [rows, setRows] = useState<MrbsUserRow[]>(mrbsUsers);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const koinoniaLabel = (u: KoinoniaUser) => u.displayName ?? u.name ?? u.email ?? u.id;

  async function link(mrbsUsername: string, userId: string) {
    setSaving(mrbsUsername);
    setError(null);
    try {
      const res = await fetch("/api/admin/mrbs-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrbsUsername, userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setRows((prev) =>
        prev.map((r) => (r.mrbsUsername === mrbsUsername ? { ...r, linkedUserId: userId, autoMatchUserId: null } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(null);
    }
  }

  async function unlink(mrbsUsername: string) {
    setSaving(mrbsUsername);
    setError(null);
    try {
      const res = await fetch(`/api/admin/mrbs-links?mrbsUsername=${encodeURIComponent(mrbsUsername)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setRows((prev) =>
        prev.map((r) => (r.mrbsUsername === mrbsUsername ? { ...r, linkedUserId: null } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(null);
    }
  }

  async function autoLinkAll() {
    const toLink = rows.filter((r) => !r.linkedUserId && r.autoMatchUserId);
    for (const row of toLink) {
      await link(row.mrbsUsername, row.autoMatchUserId!);
    }
  }

  const autoLinkCount = rows.filter((r) => !r.linkedUserId && r.autoMatchUserId).length;
  const linkedCount = rows.filter((r) => r.linkedUserId).length;
  const unmatchedCount = rows.filter((r) => !r.linkedUserId && !r.autoMatchUserId).length;

  if (!hasMrbsDb) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-sm text-yellow-800">
        <p className="font-semibold mb-1">Variable MRBS_DB_URL non configurée</p>
        <p>Sans accès à la base MRBS, la moulinette ne peut pas lire les comptes existants. Configurez <code className="font-mono bg-yellow-100 px-1 rounded">MRBS_DB_URL</code> dans votre fichier <code className="font-mono bg-yellow-100 px-1 rounded">.env</code>.</p>
        <p className="mt-2 text-yellow-600">Les liaisons manuelles restent possibles via l&apos;API <code className="font-mono">POST /api/admin/mrbs-links</code>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Liés", value: linkedCount, color: "text-green-700 bg-green-50 border-green-200" },
          { label: "Auto-détectés", value: autoLinkCount, color: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "Sans correspondance", value: unmatchedCount, color: "text-gray-700 bg-gray-50 border-gray-200" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-4 text-center ${color}`}>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {autoLinkCount > 0 && (
        <div className="flex justify-end">
          <Button onClick={autoLinkAll} disabled={saving !== null} size="sm">
            Lier automatiquement ({autoLinkCount})
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Aucun compte MRBS trouvé dans la base de données.</p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Compte MRBS</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Niveau MRBS</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Compte Koinonia</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const linked = koinoniaUsers.find((u) => u.id === row.linkedUserId);
                const autoMatch = koinoniaUsers.find((u) => u.id === row.autoMatchUserId);
                const isSaving = saving === row.mrbsUsername;

                return (
                  <tr key={row.mrbsUsername} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.mrbsDisplayName}</p>
                      <p className="text-xs text-gray-400 font-mono">{row.mrbsUsername}</p>
                      {row.mrbsEmail && row.mrbsEmail !== row.mrbsUsername && (
                        <p className="text-xs text-gray-400">{row.mrbsEmail}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${LEVEL_COLORS[row.mrbsLevel] ?? LEVEL_COLORS[0]}`}>
                        {LEVEL_LABELS[row.mrbsLevel] ?? "Inconnu"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {linked ? (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-gray-800">{koinoniaLabel(linked)}</span>
                        </div>
                      ) : autoMatch ? (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          <span className="text-blue-700">{koinoniaLabel(autoMatch)}</span>
                          <span className="text-xs text-blue-500">(email)</span>
                        </div>
                      ) : (
                        <ManualLinkSelect
                          mrbsUsername={row.mrbsUsername}
                          koinoniaUsers={koinoniaUsers}
                          linkedByKoinonia={linkedByKoinonia}
                          currentLinkedUserId={row.linkedUserId}
                          onLink={(userId) => link(row.mrbsUsername, userId)}
                          disabled={isSaving}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {linked ? (
                        <button
                          onClick={() => unlink(row.mrbsUsername)}
                          disabled={isSaving}
                          className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {isSaving ? "…" : "Délier"}
                        </button>
                      ) : autoMatch ? (
                        <button
                          onClick={() => link(row.mrbsUsername, row.autoMatchUserId!)}
                          disabled={isSaving}
                          className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {isSaving ? "…" : "Lier"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ManualLinkSelect({
  mrbsUsername,
  koinoniaUsers,
  linkedByKoinonia,
  currentLinkedUserId,
  onLink,
  disabled,
}: {
  mrbsUsername: string;
  koinoniaUsers: KoinoniaUser[];
  linkedByKoinonia: Record<string, string>;
  currentLinkedUserId: string | null;
  onLink: (userId: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState(currentLinkedUserId ?? "");

  const available = koinoniaUsers.filter(
    (u) => !linkedByKoinonia[u.id] || linkedByKoinonia[u.id] === mrbsUsername
  );

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-icc-violet bg-white w-44"
      >
        <option value="">— Sélectionner —</option>
        {available.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName ?? u.name ?? u.email ?? u.id}
          </option>
        ))}
      </select>
      {value && (
        <button
          onClick={() => onLink(value)}
          disabled={disabled}
          className="text-xs text-icc-violet hover:text-purple-700 border border-icc-violet/40 hover:bg-icc-violet/5 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
        >
          Lier
        </button>
      )}
    </div>
  );
}
