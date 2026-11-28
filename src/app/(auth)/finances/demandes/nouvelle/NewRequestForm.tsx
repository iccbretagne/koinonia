"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AttachmentManager, { type AttachmentItem } from "@/app/(auth)/finances/components/AttachmentManager";
import { Alert, Button, Input, Select, Textarea, buttonClasses, fieldLabelClasses } from "@/components/ui";
import { paths } from "@/lib/paths";

interface Department {
  id: string;
  name: string;
  ministry: { name: string };
}

export interface CorrectionSource {
  id: string;
  type: "EXPENSE_REPORT" | "BUDGET_ADVANCE";
  departmentId: string | null;
  label: string;
  description: string | null;
  amount: string;
  attachmentCount: number;
}

/** Complément d'un dépassement (spec 078) : note de frais liée aux factures d'une avance. */
export interface ComplementSource {
  justificationId: string;
  label: string;
  departmentId: string | null;
  remaining: number;
}

interface Props {
  readonly departments: Department[];
  readonly complement?: ComplementSource | null;
  /** Demande rejetée à corriger : pré-remplit le formulaire et lie la nouvelle demande. */
  readonly correction?: CorrectionSource | null;
  /** Page de retour après soumission (spec 043 : "/requests" si on vient de Mes demandes). */
  readonly redirectTo?: string;
}

type RequestMode = "one_shot" | "recurring";

export default function NewRequestForm({ departments, correction, complement, redirectTo = paths.accounting.requests() }: Props) {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<RequestMode>("one_shot");
  const [type, setType] = useState<"EXPENSE_REPORT" | "BUDGET_ADVANCE">(correction?.type ?? "EXPENSE_REPORT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  const [form, setForm] = useState({
    // Correction : "" = demande personnelle (sans département), comme dans le sélecteur
    departmentId: correction ? (correction.departmentId ?? "") : complement ? (complement.departmentId ?? "") : (departments[0]?.id ?? ""),
    label:        correction?.label ?? (complement ? `Complément — ${complement.label}` : ""),
    description:  correction?.description ?? "",
    amount:       correction?.amount ?? (complement ? String(complement.remaining) : ""),
  });
  const [recurrence, setRecurrence] = useState({
    every:     "1",
    unit:      "MONTH" as "WEEK" | "MONTH",
    firstDate: "",
  });

  // Pour les avances récurrentes (série), un département est obligatoire
  const isRecurringMode = mode === "recurring";

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const amount = Number.parseFloat(form.amount);
      if (Number.isNaN(amount) || amount <= 0) { setError("Montant invalide"); setLoading(false); return; }

      let res: Response;
      if (mode === "recurring") {
        res = await fetch("/api/accounting/series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentId:        form.departmentId,
            label:               form.label,
            description:         form.description || undefined,
            amount,
            recurrenceEvery:     Number.parseInt(recurrence.every),
            recurrenceUnit:      recurrence.unit,
            firstOccurrenceDate: new Date(recurrence.firstDate).toISOString(),
          }),
        });
      } else {
        res = await fetch("/api/accounting/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            departmentId:  form.departmentId || undefined, // undefined = personnel sans département
            label:         form.label,
            description:   form.description || undefined,
            amount,
            attachmentIds: attachments.map((a) => a.id),
            correctionOfId: correction?.id,
            overageOfJustificationId: complement?.justificationId,
          }),
        });
      }

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      router.push(redirectTo);
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  const modeOptions = [
    { value: "one_shot",  label: "Note de frais",     desc: "Dépense déjà effectuée" },
    { value: "one_shot",  label: "Avance ponctuelle", desc: "Dépense à venir, une seule fois", type: "BUDGET_ADVANCE" as const },
    { value: "recurring", label: "Avance récurrente", desc: "Virement régulier planifié" },
  ].filter((opt) => !correction || opt.value !== "recurring");

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {correction && (
        <Alert tone="warning" title={`Correction de « ${correction.label} ».`}>
          Les informations de la demande rejetée sont reprises, modifiez ce qui doit l&apos;être.
          {correction.attachmentCount > 0 && (
            <span className="mt-1 block">
              Les pièces jointes restent sur la demande rejetée : redéposez celles qui sont toujours valables.
            </span>
          )}
        </Alert>
      )}

      {complement && (
        <Alert tone="info" title={`Complément de « ${complement.label} ».`}>
          Jusqu&apos;à {complement.remaining.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}. Les factures
          déjà déposées le justifient, inutile de les joindre à nouveau.
        </Alert>
      )}

      {/* Mode */}
      {!complement && (
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className={`${fieldLabelClasses} mb-1.5`}>Type de demande</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {modeOptions.map((opt) => {
              const isActive = mode === opt.value && (opt.type ? type === opt.type : type === "EXPENSE_REPORT" || opt.value === "recurring");
              return (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setMode(opt.value as RequestMode);
                    if (opt.type) setType(opt.type);
                    else if (opt.value === "one_shot") setType("EXPENSE_REPORT");
                  }}
                  className={`flex min-h-11 flex-col rounded-control border px-4 py-3 text-left transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    isActive ? "border-brand bg-brand-soft" : "border-control-line hover:bg-surface-sunken"
                  }`}
                >
                  <span className="font-display text-[15px] font-semibold leading-[22px] text-ink">{opt.label}</span>
                  <span className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Département */}
      <Select
        label="Département"
        hint={isRecurringMode ? undefined : "Facultatif pour les notes de frais personnelles."}
        value={form.departmentId}
        onChange={(e) => set("departmentId", e.target.value)}
        required={isRecurringMode}
        options={[
          ...(isRecurringMode ? [] : [{ value: "", label: "Personnel (sans département)" }]),
          ...departments.map((d) => ({ value: d.id, label: `${d.ministry.name} — ${d.name}` })),
        ]}
      />

      {/* Intitulé */}
      <Input
        label="Intitulé"
        type="text"
        value={form.label}
        onChange={(e) => set("label", e.target.value)}
        required
        maxLength={200}
        placeholder="ex : Achat matériel son — culte du 15 juin"
      />

      {/* Montant */}
      <Input
        label="Montant TTC (€)"
        type="number"
        inputMode="decimal"
        value={form.amount}
        onChange={(e) => set("amount", e.target.value)}
        required
        min={0.01}
        step={0.01}
        placeholder="0,00"
      />

      {/* Récurrence */}
      {mode === "recurring" && (
        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="mb-1 font-display text-[15px] font-semibold leading-[22px] text-ink">Récurrence</legend>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Tous les"
              type="number"
              value={recurrence.every}
              onChange={(e) => setRecurrence((r) => ({ ...r, every: e.target.value }))}
              min={1}
              max={99}
              className="w-24"
            />
            <Select
              label="Période"
              value={recurrence.unit}
              onChange={(e) => setRecurrence((r) => ({ ...r, unit: e.target.value as "WEEK" | "MONTH" }))}
              options={[
                { value: "WEEK", label: Number(recurrence.every) > 1 ? "semaines" : "semaine" },
                { value: "MONTH", label: "mois" },
              ]}
            />
          </div>
          <Input
            id={`${id}-first-date`}
            label="Date de la première occurrence"
            type="date"
            value={recurrence.firstDate}
            onChange={(e) => setRecurrence((r) => ({ ...r, firstDate: e.target.value }))}
            required={mode === "recurring"}
          />
        </fieldset>
      )}

      {/* Description */}
      <Textarea
        label="Description (facultatif)"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        rows={3}
        placeholder="Détail de la dépense, contexte, références devis…"
      />

      {/* Pièces jointes */}
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className={`${fieldLabelClasses} mb-1.5`}>Pièces jointes (reçu, facture, devis…)</legend>
        <AttachmentManager
          attachments={attachments}
          canUpload
          canDelete
          onChange={setAttachments}
        />
      </fieldset>

      {error && <Alert tone="danger" role="alert">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Link href={redirectTo} className={buttonClasses("secondary", "md")}>Annuler</Link>
        <Button type="submit" disabled={loading}>
          {loading ? "Envoi…" : "Envoyer la demande"}
        </Button>
      </div>
    </form>
  );
}
