"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, UserPlus } from "lucide-react";
import Input from "@/components/ui/Input";
import Checkbox from "@/components/ui/Checkbox";
import IconButton from "@/components/ui/IconButton";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

interface Companion {
  id: string;
  name: string | null;
  email: string | null;
  departments: { id: string; name: string }[];
  isMsdp: boolean;
  exception: "ADDED" | "EXCLUDED" | null;
  activeAssignments: number;
}

interface Settings {
  msdp: Companion[];
  added: Companion[];
  candidates: Companion[];
}

type PendingAction = {
  userId: string;
  name: string;
  state: "ADDED" | "EXCLUDED" | "DEFAULT";
  activeAssignments: number;
  question: string;
  message: string;
};

function displayName(c: Companion): string {
  return c.name ?? c.email ?? "STAR";
}

/**
 * Accompagnants du suivi pastoral (spec 056) : liste calculée à partir du MSDP, avec exceptions
 * déclarées. Exclure un membre du MSDP ou retirer un STAR ajouté demande confirmation quand des
 * demandes lui sont confiées ; ajouter ou réintégrer est immédiat.
 */
export default function CompanionsSettings({
  churchId,
  initial,
}: {
  readonly churchId: string;
  readonly initial: Settings;
}) {
  const router = useRouter();
  const toast = useToast();
  // Pas d'état local pour `initial` : `router.refresh()` après chaque changement redemande la
  // page serveur, qui repasse des props à jour (évite une resynchronisation manuelle).
  const settings = initial;
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return settings.candidates
      .filter((c) => displayName(c).toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, settings.candidates]);

  async function applyState(userId: string, state: "ADDED" | "EXCLUDED" | "DEFAULT") {
    setSaving(true);
    try {
      const res = await fetch("/api/care/companions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, userId, state }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de l'enregistrement");
      toast.success("Accompagnants mis à jour.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  function excludeFromMsdp(c: Companion) {
    if (c.activeAssignments > 0) {
      setPending({
        userId: c.id,
        name: displayName(c),
        state: "EXCLUDED",
        activeAssignments: c.activeAssignments,
        question: `Écarter ${displayName(c)} des accompagnants ?`,
        message: `${c.activeAssignments} demande${c.activeAssignments > 1 ? "s" : ""} en cours reste${
          c.activeAssignments > 1 ? "nt" : ""
        } confiée${c.activeAssignments > 1 ? "s" : ""} à cette personne. Elle ne pourra plus en recevoir de nouvelles.`,
      });
      return;
    }
    applyState(c.id, "EXCLUDED");
  }

  function removeAdded(c: Companion) {
    if (c.activeAssignments > 0) {
      setPending({
        userId: c.id,
        name: displayName(c),
        state: "DEFAULT",
        activeAssignments: c.activeAssignments,
        question: `Retirer ${displayName(c)} des accompagnants ?`,
        message: `${c.activeAssignments} demande${c.activeAssignments > 1 ? "s" : ""} en cours reste${
          c.activeAssignments > 1 ? "nt" : ""
        } confiée${c.activeAssignments > 1 ? "s" : ""} à cette personne. Elle ne pourra plus en recevoir de nouvelles.`,
      });
      return;
    }
    applyState(c.id, "DEFAULT");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
          Équipe MSDP
        </div>
        {settings.msdp.length === 0 ? (
          <EmptyState size="sm" title="Aucun membre du MSDP" />
        ) : (
          <ul className="divide-y divide-line">
            {settings.msdp.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <label className="flex flex-1 min-w-0 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={c.exception !== "EXCLUDED"}
                    disabled={saving}
                    onChange={() => (c.exception === "EXCLUDED" ? applyState(c.id, "DEFAULT") : excludeFromMsdp(c))}
                    aria-label={`Accompagnant : ${displayName(c)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{displayName(c)}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {c.departments.map((d) => d.name).join(", ")}
                      {c.activeAssignments > 0 ? ` · ${c.activeAssignments} en cours` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
          Ajoutés hors MSDP
        </div>
        {settings.added.length === 0 ? (
          <EmptyState size="sm" title="Aucun STAR ajouté" description="Cherchez un STAR ci-dessous pour l'ajouter." />
        ) : (
          <ul className="divide-y divide-line">
            {settings.added.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{displayName(c)}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {c.departments.map((d) => d.name).join(", ") || "Aucun département"}
                    {c.activeAssignments > 0 ? ` · ${c.activeAssignments} en cours` : ""}
                  </span>
                </span>
                <IconButton
                  icon={UserMinus}
                  aria-label={`Retirer ${displayName(c)} des accompagnants`}
                  disabled={saving}
                  onClick={() => removeAdded(c)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Input
          label="Ajouter un STAR hors MSDP"
          placeholder="Rechercher par nom ou email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
            {filteredCandidates.length === 0 ? (
              <li className="px-4 py-3 text-sm text-ink-muted">Aucun résultat.</li>
            ) : (
              filteredCandidates.map((c) => (
                <li key={c.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{displayName(c)}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {c.departments.map((d) => d.name).join(", ") || "Aucun département"}
                    </span>
                  </span>
                  <IconButton
                    icon={UserPlus}
                    aria-label={`Ajouter ${displayName(c)} comme accompagnant`}
                    disabled={saving}
                    onClick={() => {
                      applyState(c.id, "ADDED");
                      setQuery("");
                    }}
                  />
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={!!pending}
        title={pending?.question ?? ""}
        message={pending?.message ?? ""}
        confirmLabel="Confirmer"
        confirming={saving}
        onConfirm={() => pending && applyState(pending.userId, pending.state)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
