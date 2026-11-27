"use client";

import { useState } from "react";
import { Alert, Button, FilterChip, Modal, Select } from "@/components/ui";

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
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}

        {fixedUserLabel ? (
          <p className="text-[15px] leading-[22px]">
            <span className="text-ink-muted">Personne : </span>
            <span className="font-medium text-ink">{fixedUserLabel}</span>
          </p>
        ) : (
          <Select
            label="Personne"
            placeholder="Choisir"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={userOptions ?? []}
          />
        )}

        {fixedTargetLabel ? (
          <p className="text-[15px] leading-[22px]">
            <span className="text-ink-muted">{mode === "minister" ? "Ministère : " : "Département : "}</span>
            <span className="font-medium text-ink">{fixedTargetLabel}</span>
          </p>
        ) : (
          <Select
            label={mode === "minister" ? "Ministère" : "Département"}
            placeholder="Choisir"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            options={targetOptions ?? []}
          />
        )}

        {mode === "department-head" && (
          <fieldset className="min-w-0">
            <legend className="mb-2 block text-sm font-semibold text-ink">Type</legend>
            <div className="flex flex-wrap gap-2">
              <FilterChip pressed={!isDeputy} onClick={() => setIsDeputy(false)}>
                Responsable principal
              </FilterChip>
              <FilterChip pressed={isDeputy} onClick={() => setIsDeputy(true)}>
                Responsable adjoint
              </FilterChip>
            </div>
          </fieldset>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!userId || !targetId || loading}>
            {loading ? "Enregistrement…" : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
