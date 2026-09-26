"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

export interface ResponsibilitySelection {
  userId: string;
  targetId: string;
  isDeputy: boolean;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string;
  /** Ministre : un seul choix de ministère. Resp. département : choix + adjoint. */
  readonly mode: "minister" | "department-head";
  /**
   * Depuis la vue par rôle : la cible (ministère/département) est fixe, on choisit la personne.
   * Depuis la fiche personne : la personne est fixe, on choisit la cible.
   * Exactement l'un des deux jeux de props (`userOptions` / `fixedUserLabel` et
   * `targetOptions` / `fixedTargetLabel`) est fourni.
   */
  readonly userOptions?: { value: string; label: string }[];
  readonly fixedUserId?: string;
  readonly fixedUserLabel?: string;
  readonly targetOptions?: { value: string; label: string }[];
  readonly fixedTargetId?: string;
  readonly fixedTargetLabel?: string;
  readonly onSubmit: (selection: ResponsibilitySelection) => Promise<void>;
  readonly submitLabel?: string;
}

export default function ResponsibilityModal({
  open,
  onClose,
  title,
  subtitle,
  mode,
  userOptions,
  fixedUserId,
  fixedUserLabel,
  targetOptions,
  fixedTargetId,
  fixedTargetLabel,
  onSubmit,
  submitLabel = "Ajouter",
}: Props) {
  const [userId, setUserId] = useState(fixedUserId ?? "");
  const [targetId, setTargetId] = useState(fixedTargetId ?? "");
  const [isDeputy, setIsDeputy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!userId || !targetId) return;
    setLoading(true);
    setError("");
    try {
      await onSubmit({ userId, targetId, isDeputy });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}

        {fixedUserLabel ? (
          <p className="text-sm">
            <span className="text-gray-400">Personne : </span>
            <span className="font-medium text-gray-900">{fixedUserLabel}</span>
          </p>
        ) : (
          <Select
            label="Personne"
            placeholder="-- Sélectionner --"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={userOptions ?? []}
          />
        )}

        {fixedTargetLabel ? (
          <p className="text-sm">
            <span className="text-gray-400">{mode === "minister" ? "Ministère : " : "Département : "}</span>
            <span className="font-medium text-gray-900">{fixedTargetLabel}</span>
          </p>
        ) : (
          <Select
            label={mode === "minister" ? "Ministère" : "Département"}
            placeholder="-- Sélectionner --"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            options={targetOptions ?? []}
          />
        )}

        {mode === "department-head" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsDeputy(false)}
                className={`flex-1 py-2 text-sm rounded-lg border-2 font-medium transition-colors ${
                  !isDeputy ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Responsable principal
              </button>
              <button
                type="button"
                onClick={() => setIsDeputy(true)}
                className={`flex-1 py-2 text-sm rounded-lg border-2 font-medium transition-colors ${
                  isDeputy ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Responsable adjoint
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!userId || !targetId || loading}>
            {loading ? "…" : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
