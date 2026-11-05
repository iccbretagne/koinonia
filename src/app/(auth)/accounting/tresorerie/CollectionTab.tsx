"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Alert, Button, IconButton, Input, Select, useToast } from "@/components/ui";
import type { AccountView, CategoryView, PurposeView } from "@/modules/treasury";
import { api, errorText, euro, frDate, isoToday, toNumber } from "./format";

interface Cheque {
  key: number;
  number: string;
  amount: string;
}

interface Row {
  key: number;
  categoryId: string;
  purposeId: string;
  cash: string;
  cheques: Cheque[];
}

let nextKey = 1;
const newKey = () => nextKey++;

const amountOf = (v: string) => {
  const n = toNumber(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const sumCents = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;

/**
 * Collecte d'un culte (spec 076) : par catégorie, le total en espèces et les chèques un par un,
 * comptés par deux personnes. Enregistre les lignes dans la caisse choisie.
 */
export default function CollectionTab({
  accounts,
  categories,
  purposes,
  services,
}: {
  readonly accounts: AccountView[];
  readonly categories: CategoryView[];
  readonly purposes: PurposeView[];
  readonly services: { id: string; title: string; date: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const incomes = categories.filter((c) => c.direction === "IN" && c.active);
  const special = incomes.find((c) => c.system === "SPECIAL_OFFERING");
  const activePurposes = purposes.filter((p) => p.active);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "CASH")?.id ?? accounts[0]?.id ?? "");
  const [eventId, setEventId] = useState("");
  const [date, setDate] = useState(isoToday());
  const [counter1, setCounter1] = useState("");
  const [counter2, setCounter2] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    incomes
      .filter((c) => ["Dîmes", "Offrandes"].includes(c.name) || c.system === "SPECIAL_OFFERING")
      .map((c) => ({ key: newKey(), categoryId: c.id, purposeId: "", cash: "", cheques: [] }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const name = (id: string) => incomes.find((c) => c.id === id)?.name ?? "";

  const recap = (() => {
    const byCategory = rows.map((r) => {
      const cash = amountOf(r.cash);
      const cheques = sumCents(r.cheques.map((c) => amountOf(c.amount)));
      const purpose = activePurposes.find((p) => p.id === r.purposeId)?.name;
      return { key: r.key, label: purpose ? `${name(r.categoryId)} · ${purpose}` : name(r.categoryId), cash, cheques };
    });
    const cash = sumCents(byCategory.map((c) => c.cash));
    const cheques = sumCents(byCategory.map((c) => c.cheques));
    return { byCategory: byCategory.filter((c) => c.cash + c.cheques > 0), cash, cheques, total: sumCents([cash, cheques]) };
  })();

  function chooseService(id: string) {
    setEventId(id);
    const s = services.find((x) => x.id === id);
    if (s) setDate(s.date);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/accounting/tresorerie/collections", {
        method: "POST",
        json: {
          accountId,
          eventId: eventId || null,
          date,
          counter1,
          counter2,
          lines: rows
            .filter((r) => amountOf(r.cash) > 0 || r.cheques.some((c) => amountOf(c.amount) > 0))
            .map((r) => ({
              categoryId: r.categoryId,
              purposeId: r.purposeId || null,
              cash: amountOf(r.cash),
              cheques: r.cheques.filter((c) => amountOf(c.amount) > 0).map((c) => ({ number: c.number || null, amount: amountOf(c.amount) })),
            })),
        },
      });
      toast.success("Collecte enregistrée");
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
            label="Culte"
            value={eventId}
            onChange={(e) => chooseService(e.target.value)}
            options={[{ value: "", label: "Date libre" }, ...services.map((s) => ({ value: s.id, label: `${s.title} · ${frDate(s.date)}` }))]}
          />
          <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Select label="Déposée dans" value={accountId} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Par catégorie</h2>
          <p className="text-sm text-ink-muted">Le total des espèces, sans le détail des billets et des pièces ; les chèques un par un, sans nom de donateur.</p>
          {rows.map((r) => {
            const isSpecial = r.categoryId === special?.id;
            return (
              <div key={r.key} className="space-y-3 rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Select
                    label="Catégorie"
                    value={r.categoryId}
                    onChange={(e) => update(r.key, { categoryId: e.target.value, purposeId: "" })}
                    options={incomes.map((c) => ({ value: c.id, label: c.name }))}
                  />
                  {isSpecial && (
                    <Select
                      label="Objet"
                      required
                      placeholder="Choisir…"
                      value={r.purposeId}
                      onChange={(e) => update(r.key, { purposeId: e.target.value })}
                      options={activePurposes.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  )}
                  <Input label="Espèces (€)" inputMode="decimal" placeholder="0,00" value={r.cash} onChange={(e) => update(r.key, { cash: e.target.value })} />
                  <IconButton icon={X} aria-label="Retirer cette catégorie" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
                </div>
                <ul className="space-y-2">
                  {r.cheques.map((c) => (
                    <li key={c.key} className="flex flex-wrap items-end gap-3">
                      <Input label="N° de chèque (facultatif)" value={c.number} onChange={(e) => update(r.key, { cheques: r.cheques.map((x) => (x.key === c.key ? { ...x, number: e.target.value } : x)) })} />
                      <Input label="Montant (€)" inputMode="decimal" value={c.amount} onChange={(e) => update(r.key, { cheques: r.cheques.map((x) => (x.key === c.key ? { ...x, amount: e.target.value } : x)) })} />
                      <IconButton icon={X} aria-label="Retirer ce chèque" onClick={() => update(r.key, { cheques: r.cheques.filter((x) => x.key !== c.key) })} />
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="ghost" size="sm" onClick={() => update(r.key, { cheques: [...r.cheques, { key: newKey(), number: "", amount: "" }] })}>
                  <Plus aria-hidden className="h-4 w-4" /> Ajouter un chèque
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows((rs) => [...rs, { key: newKey(), categoryId: special?.id ?? incomes[0]?.id ?? "", purposeId: "", cash: "", cheques: [] }])}
          >
            <Plus aria-hidden className="h-4 w-4" /> Ajouter une catégorie
          </Button>
        </section>
      </div>

      <aside className="flex flex-[1_1_300px] flex-col gap-4 rounded-card border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">Récapitulatif</h2>
        <ul className="space-y-2 text-sm">
          {recap.byCategory.map((c) => (
            <li key={c.key} className="flex justify-between gap-3">
              <span className="text-ink">{c.label}</span>
              <span className="tabular-nums font-semibold">{euro(sumCents([c.cash, c.cheques]))}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line pt-3 text-sm">
          <p className="flex justify-between"><span className="text-ink-muted">Espèces</span><span className="tabular-nums">{euro(recap.cash)}</span></p>
          <p className="flex justify-between"><span className="text-ink-muted">Chèques</span><span className="tabular-nums">{euro(recap.cheques)}</span></p>
          <p className="flex justify-between text-base font-semibold"><span>Total de la collecte</span><span className="tabular-nums text-brand-text">{euro(recap.total)}</span></p>
        </div>
        <p className="border-t border-line pt-3 text-sm text-ink-muted">Deux personnes comptent ensemble.</p>
        <Input label="Compté par" required value={counter1} onChange={(e) => setCounter1(e.target.value)} />
        <Input label="Vérifié par" required value={counter2} onChange={(e) => setCounter2(e.target.value)} />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" disabled={busy || recap.total === 0}>{busy ? "Enregistrement…" : "Enregistrer la collecte"}</Button>
      </aside>
    </form>
  );
}
