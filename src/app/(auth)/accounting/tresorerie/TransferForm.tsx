"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Modal, Select, useToast } from "@/components/ui";
import type { AccountView } from "@/modules/treasury";
import { api, errorText, isoToday, toNumber } from "./format";

/** Transfert entre deux comptes de l'église (spec 076) : ni recette ni dépense. */
export default function TransferForm({
  accounts,
  edit,
  onClose,
}: {
  readonly accounts: AccountView[];
  readonly edit?: { groupId: string; fromId: string; toId: string; date: string; amount: number; label: string };
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fromId, setFromId] = useState(edit?.fromId ?? accounts[0]?.id ?? "");
  const [toId, setToId] = useState(edit?.toId ?? accounts[1]?.id ?? "");
  const [date, setDate] = useState(edit?.date ?? isoToday());
  const [amount, setAmount] = useState(edit ? String(edit.amount).replace(".", ",") : "");
  const [label, setLabel] = useState(edit?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = accounts.map((a) => ({ value: a.id, label: a.name }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = { fromId, toId, date, amount: toNumber(amount), label: label || null };
      if (edit) await api(`/api/accounting/tresorerie/transfers/${edit.groupId}`, { method: "PATCH", json });
      else await api("/api/accounting/tresorerie/transfers", { method: "POST", json });
      toast.success(edit ? "Transfert corrigé" : "Transfert enregistré");
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={edit ? "Corriger le transfert" : "Transfert entre comptes"}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4 p-1">
        <p className="text-sm text-ink-muted">Le total de l&apos;église ne change pas : ce n&apos;est ni une recette ni une dépense.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Depuis" value={fromId} onChange={(e) => setFromId(e.target.value)} options={options} />
          <Select label="Vers" value={toId} onChange={(e) => setToId(e.target.value)} options={options} />
          <Input label="Montant (€)" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input label="Libellé (facultatif)" maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} />
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={busy || fromId === toId}>{busy ? "Enregistrement…" : "Enregistrer le transfert"}</Button>
        </div>
      </form>
    </Modal>
  );
}
