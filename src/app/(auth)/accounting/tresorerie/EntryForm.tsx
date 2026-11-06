"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Modal, Select, useToast } from "@/components/ui";
import type { AccountView, CategoryView, LedgerLine, PurposeView } from "@/modules/treasury";
import { AUTOMATIC_SYSTEMS, METHODS, METHOD_LABEL, RECEIPT_MAX_BYTES } from "@/modules/treasury/schemas";
import type { TreasuryDirection, TreasuryMethod } from "@/generated/prisma/enums";
import { errorText, isoToday, toNumber } from "./format";

/**
 * Saisie ou correction d'une entrée ou d'une sortie (spec 076). Justificatif par photo ou par
 * document : deux champs distincts, car `capture` empêche de choisir un fichier sur mobile.
 * Un doublon (même date, montant, compte, catégorie) demande une confirmation.
 */
export default function EntryForm({
  line,
  accounts,
  categories,
  purposes,
  onClose,
}: {
  readonly line: LedgerLine | null;
  readonly accounts: AccountView[];
  readonly categories: CategoryView[];
  readonly purposes: PurposeView[];
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const ids = useId();
  const [form, setForm] = useState(() => ({
    direction: (line?.direction ?? "IN") as TreasuryDirection,
    accountId: line?.accountId ?? accounts[0]?.id ?? "",
    categoryId: line?.categoryId ?? "",
    purposeId: line?.purposeId ?? "",
    method: (line?.method ?? "CASH") as TreasuryMethod,
    amount: line ? String(line.amount).replace(".", ",") : "",
    date: line?.date ?? isoToday(),
    label: line?.label ?? "",
    thirdParty: line?.thirdParty ?? "",
  }));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDuplicate(false);
  };

  const usable = categories.filter(
    (c) => c.direction === form.direction && (c.active || c.id === line?.categoryId) && !(c.system && AUTOMATIC_SYSTEMS.includes(c.system))
  );
  const category = categories.find((c) => c.id === form.categoryId);
  const needsPurpose = category?.system === "SPECIAL_OFFERING";

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > RECEIPT_MAX_BYTES) {
      setError("Le justificatif dépasse 10 Mo.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function save(confirmDuplicate: boolean) {
    const amount = toNumber(form.amount);
    if (!(amount > 0)) {
      setError("Saisissez un montant positif.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set(
      "data",
      JSON.stringify({
        accountId: form.accountId,
        direction: form.direction,
        categoryId: form.categoryId,
        purposeId: needsPurpose ? form.purposeId || null : null,
        method: form.method,
        amount,
        date: form.date,
        label: form.label,
        thirdParty: form.thirdParty || null,
        confirmDuplicate,
      })
    );
    if (file) body.set("file", file);
    try {
      const res = await fetch(line ? `/api/accounting/tresorerie/entries/${line.id}` : "/api/accounting/tresorerie/entries", {
        method: line ? "PATCH" : "POST",
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setDuplicate(true);
        setError(json.error ?? "Une ligne identique existe déjà.");
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast.success(line ? "Ligne corrigée" : "Ligne enregistrée");
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={line ? "Corriger la ligne" : "Ajouter un mouvement"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="space-y-4 p-1">
        <fieldset className="flex gap-2">
          <legend className="sr-only">Sens</legend>
          {(["IN", "OUT"] as const).map((d) => (
            <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-control border text-sm font-semibold ${form.direction === d ? "border-brand bg-brand-soft text-brand-text" : "border-control-line text-ink-muted"}`}>
              <input type="radio" className="sr-only" name={`${ids}-dir`} checked={form.direction === d} onChange={() => setForm((f) => ({ ...f, direction: d, categoryId: "" }))} />
              {d === "IN" ? "Entrée" : "Sortie"}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Compte" required value={form.accountId} onChange={(e) => set("accountId", e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <Select
            label="Catégorie"
            required
            placeholder="Choisir…"
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            options={usable.map((c) => ({ value: c.id, label: c.name }))}
          />
          {needsPurpose && (
            <Select
              label="Objet de l'offrande"
              required
              placeholder="Choisir…"
              value={form.purposeId}
              onChange={(e) => set("purposeId", e.target.value)}
              options={purposes.filter((p) => p.active || p.id === line?.purposeId).map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          <Select label="Moyen" value={form.method} onChange={(e) => set("method", e.target.value as TreasuryMethod)} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          <Input label="Montant (€)" required inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          <Input label="Date" type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
        </div>
        <Input label="Libellé" required maxLength={200} value={form.label} onChange={(e) => set("label", e.target.value)} />
        <Input label="Tiers (facultatif)" hint="Fournisseur, organisme…" maxLength={120} value={form.thirdParty} onChange={(e) => set("thirdParty", e.target.value)} />

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-muted">Justificatif (facultatif)</p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-control-line px-3 text-sm font-semibold text-ink">
              Prendre une photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-control-line px-3 text-sm font-semibold text-ink">
              Choisir un document
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          </div>
          {file && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} Mo
              <button type="button" className="font-semibold text-brand-text" onClick={() => setFile(null)}>Retirer</button>
            </p>
          )}
          {!file && line?.hasReceipt && <p className="text-sm text-ink-muted">Un justificatif est déjà enregistré.</p>}
        </div>

        {error && <Alert tone={duplicate ? "warning" : "danger"}>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          {duplicate ? (
            <Button type="button" disabled={busy} onClick={() => void save(true)}>
              {busy ? "Enregistrement…" : "Enregistrer quand même"}
            </Button>
          ) : (
            <Button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
