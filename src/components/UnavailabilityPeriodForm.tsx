"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CheckboxGroup from "@/components/ui/CheckboxGroup";

/**
 * Formulaire « Pas disponible du … au … » (spec 058) : période, départements, motif et — pour un
 * responsable — remplaçants. Partagé entre « Mes disponibilités » et « Indisponibilités ».
 */

export interface MemberRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface BackupOption {
  value: string;
  label: string;
}

export interface EditablePeriod {
  id: string;
  memberId: string;
  startDate: string | null;
  endDate: string | null;
  allDepartments: boolean;
  departmentIds: string[];
  reason: string | null;
  /** Format `TYPE:id`, comme les options de remplaçants. */
  backups: string[];
  isSelf: boolean;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly churchId: string;
  readonly mode: "self" | "manage";
  readonly editing?: EditablePeriod | null;
  readonly selfMembers: MemberRef[];
  readonly manageableMembers: MemberRef[];
  readonly canDesignateBackup: boolean;
  readonly backupOptions: BackupOption[];
  /** Pré-sélectionne la fiche (ex. « Répondre pour… »). */
  readonly initialMemberId?: string;
}

function parseBackupSelection(selected: string[]) {
  return selected.map((value) => {
    const [type, id] = value.split(":");
    return type === "STAR" ? { type: "STAR" as const, memberId: id } : { type: "RESPONSIBLE" as const, userChurchRoleId: id };
  });
}

function RadioPills({
  name,
  options,
  value,
  onChange,
}: {
  readonly name: string;
  readonly options: { value: string; label: string }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-full border text-sm cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-brand text-on-brand border-brand"
              : "border-control-line text-ink-muted hover:border-brand"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default function UnavailabilityPeriodForm({
  open,
  onClose,
  onSaved,
  churchId,
  mode,
  editing = null,
  selfMembers,
  manageableMembers,
  canDesignateBackup,
  backupOptions,
  initialMemberId,
}: Props) {
  const [memberId, setMemberId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDepartments, setAllDepartments] = useState(true);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string; selectable: boolean }[]>([]);
  const [manageBackupEligible, setManageBackupEligible] = useState(false);
  const [manageBackupOptions, setManageBackupOptions] = useState<BackupOption[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // Réinitialisation à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setMemberId(editing.memberId);
      setStartDate(editing.startDate ? editing.startDate.slice(0, 10) : "");
      setEndDate(editing.endDate ? editing.endDate.slice(0, 10) : "");
      setAllDepartments(editing.allDepartments);
      setDepartmentIds(editing.departmentIds);
      setReason(editing.reason ?? "");
      setBackups(editing.backups);
    } else {
      setMemberId(initialMemberId ?? (mode === "self" ? (selfMembers[0]?.id ?? "") : ""));
      setStartDate("");
      setEndDate("");
      setAllDepartments(true);
      setDepartmentIds([]);
      setReason("");
      setBackups([]);
    }
  }, [open, editing, initialMemberId, mode, selfMembers]);

  // Départements ciblables de la fiche choisie.
  useEffect(() => {
    if (!open || !memberId) {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/absences/target-options?churchId=${churchId}&memberId=${memberId}`)
      .then((res) => (res.ok ? res.json() : { departments: [] }))
      .then((data) => {
        if (!cancelled) setDepartments(data.departments ?? []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, memberId, churchId]);

  // Remplaçants possibles quand un responsable déclare pour un tiers.
  useEffect(() => {
    if (!open || mode !== "manage" || !memberId) {
      setManageBackupEligible(false);
      setManageBackupOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingBackups(true);
    fetch(`/api/absences/backup-options?churchId=${churchId}&memberId=${memberId}`)
      .then((res) => (res.ok ? res.json() : { eligible: false, options: [] }))
      .then((data) => {
        if (cancelled) return;
        setManageBackupEligible(!!data.eligible);
        setManageBackupOptions(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setManageBackupEligible(false);
          setManageBackupOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBackups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, memberId, churchId]);

  const showBackups = mode === "self" ? canDesignateBackup && (!editing || editing.isSelf) : manageBackupEligible;
  const activeBackupOptions = mode === "self" ? backupOptions : manageBackupOptions;

  function onStartDateChange(value: string) {
    setStartDate(value);
    if (!endDate || endDate < value) setEndDate(value);
  }

  async function submit() {
    if (!editing && !memberId) return setError("Choisir une fiche STAR.");
    if (!startDate || !endDate) return setError("Date de début et date de fin sont requises.");
    if (!allDepartments && departmentIds.length === 0) return setError("Sélectionner au moins un département.");

    setSubmitting(true);
    setError(null);
    try {
      const targeting = {
        kind: "PERIOD" as const,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        allDepartments,
        ...(allDepartments ? {} : { departmentIds }),
      };
      const backupPayload = showBackups ? { backups: parseBackupSelection(backups) } : {};

      const res = editing
        ? await fetch(`/api/absences/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", ...targeting, reason: reason || null, ...backupPayload }),
          })
        : await fetch("/api/absences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ churchId, memberId, ...targeting, reason: reason || null, ...backupPayload }),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de l'enregistrement");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifier l'indisponibilité" : mode === "self" ? "Pas disponible sur une période" : "Déclarer pour un STAR"}
    >
      <div className="space-y-4">
        {!editing && mode === "self" && selfMembers.length > 1 && (
          <Select
            label="Fiche STAR"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            options={selfMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
          />
        )}
        {!editing && mode === "manage" && (
          <Select
            label="STAR"
            placeholder="Sélectionner..."
            value={memberId}
            onChange={(e) => {
              setMemberId(e.target.value);
              setBackups([]);
            }}
            options={manageableMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
          />
        )}

        <div className="space-y-3">
          <Input type="date" label="Du" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
          <Input type="date" label="Au" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-ink-muted">Pour quels départements ?</span>
          <RadioPills
            name="allDepartments"
            value={allDepartments ? "ALL" : "SOME"}
            onChange={(v) => setAllDepartments(v === "ALL")}
            options={[
              { value: "ALL", label: "Tous mes départements" },
              { value: "SOME", label: "Certains départements" },
            ]}
          />
          {!allDepartments && (
            <CheckboxGroup
              label="Départements concernés"
              options={departments.filter((d) => d.selectable).map((d) => ({ value: d.id, label: d.name }))}
              selected={departmentIds}
              onChange={setDepartmentIds}
            />
          )}
        </div>

        <Input label="Motif (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />

        {mode === "manage" && loadingBackups && <p className="text-xs text-ink-subtle">Vérification des remplaçants possibles...</p>}
        {showBackups && activeBackupOptions.length > 0 && (
          <CheckboxGroup label="Qui me remplace ? (optionnel)" options={activeBackupOptions} selected={backups} onChange={setBackups} />
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Envoi..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
