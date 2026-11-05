"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, EmptyState, Input, Select, useToast } from "@/components/ui";
import type { AccountView, ChequeInHand } from "@/modules/treasury";
import { api, errorText, euro, frDate, isoToday, toNumber } from "./format";

/**
 * Remise au compte commun (spec 076) : sortie de la caisse avec la référence du bordereau ; les
 * chèques cochés quittent la caisse, les autres y restent.
 */
export default function DepositTab({ accounts, cheques }: { readonly accounts: AccountView[]; readonly cheques: ChequeInHand[] }) {
  const router = useRouter();
  const toast = useToast();
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "CASH")?.id ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState(isoToday());
  const [ref, setRef] = useState("");
  const [cash, setCash] = useState("");
  const inAccount = cheques.filter((c) => c.accountId === accountId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(inAccount.map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashAmount = Math.max(0, toNumber(cash) || 0);
  const chosen = inAccount.filter((c) => selected.has(c.id));
  const chequesTotal = chosen.reduce((s, c) => s + Math.round(c.amount * 100), 0) / 100;
  const total = (Math.round(cashAmount * 100) + Math.round(chequesTotal * 100)) / 100;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/accounting/tresorerie/deposits", {
        method: "POST",
        json: { accountId, date, ref, cashAmount, chequeIds: chosen.map((c) => c.id) },
      });
      toast.success("Remise enregistrée");
      router.push("/accounting/tresorerie?onglet=registre");
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <section className="grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-3">
          <Select
            label="Depuis"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setSelected(new Set(cheques.filter((c) => c.accountId === e.target.value).map((c) => c.id)));
            }}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <Input label="Date de dépôt" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="N° de bordereau" required maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} />
        </section>
        <section className="rounded-card border border-line bg-surface p-5">
          <Input label="Espèces remises (€)" inputMode="decimal" placeholder="0,00" value={cash} onChange={(e) => setCash(e.target.value)} />
        </section>
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Chèques en caisse</h2>
            <p className="text-sm text-ink-muted">Cochez ceux qui partent avec ce bordereau. Les autres restent en caisse.</p>
          </div>
          {inAccount.length === 0 ? (
            <EmptyState size="sm" title="Aucun chèque en caisse dans ce compte" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {inAccount.map((c) => (
                <li key={c.id}>
                  <label className={`flex min-h-11 cursor-pointer items-center gap-3 px-5 py-2 text-sm ${selected.has(c.id) ? "bg-brand-soft" : ""}`}>
                    <Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="w-24 shrink-0 text-ink">{c.number ?? (c.count > 1 ? `${c.count} chèques` : "Sans n°")}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{frDate(c.date)} · {[c.categoryName, c.purposeName].filter(Boolean).join(" · ")}</span>
                    <span className="tabular-nums font-semibold text-ink">{euro(c.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="flex flex-[1_1_300px] flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">Bordereau {ref || "…"}</h2>
        <p className="flex justify-between text-sm"><span>Espèces</span><span className="tabular-nums">{euro(cashAmount)}</span></p>
        <p className="flex justify-between text-sm"><span>Chèques ({chosen.length})</span><span className="tabular-nums">{euro(chequesTotal)}</span></p>
        <p className="flex justify-between border-t border-line pt-2 font-semibold"><span>Total remis</span><span className="tabular-nums text-brand-text">{euro(total)}</span></p>
        <Alert tone="info">Une sortie « Remises au compte commun » est inscrite au registre. Le compte commun, lui, n&apos;est pas suivi ici.</Alert>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" disabled={busy || total === 0 || !ref}>{busy ? "Enregistrement…" : "Enregistrer la remise"}</Button>
      </aside>
    </form>
  );
}
