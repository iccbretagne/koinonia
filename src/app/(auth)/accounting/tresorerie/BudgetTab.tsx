"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmModal, Input, StatusChip, useToast } from "@/components/ui";
import type { BudgetComparison, BudgetRow, CategoryView } from "@/modules/treasury";
import { api, errorText, euro, toNumber } from "./format";

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)} %`);

function Bar({ ratio, tone }: { readonly ratio: number | null; readonly tone: string }) {
  return (
    <div className="h-2 min-w-28 rounded-full bg-surface-sunken" aria-hidden>
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.round((ratio ?? 0) * 100))}%` }} />
    </div>
  );
}

function toneOf(c: BudgetComparison) {
  if (c.overBudget) return "bg-danger";
  if (c.warning) return "bg-warning";
  return c.direction === "IN" ? "bg-success" : "bg-brand";
}

/**
 * Budget prévisionnel (spec 076) : montant annuel par catégorie, réparti également par mois ;
 * réalisé du registre depuis le début de l'année ; dépassement signalé.
 */
export default function BudgetTab({
  year,
  rows,
  comparison,
  categories,
}: {
  readonly year: number;
  readonly rows: BudgetRow[];
  readonly comparison: BudgetComparison[];
  readonly categories: CategoryView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.categoryId, String(r.annual).replace(".", ",")]))
  );
  const [copy, setCopy] = useState<"budget" | "actual" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const touched = categories.filter((c) => values[c.id] !== undefined && values[c.id] !== "");
      await api("/api/accounting/tresorerie/budget", {
        method: "PUT",
        json: { year, rows: touched.map((c) => ({ categoryId: c.id, annual: Math.max(0, toNumber(values[c.id]) || 0) })) },
      });
      toast.success("Budget enregistré");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyFrom(from: "budget" | "actual") {
    setBusy(true);
    setError(null);
    try {
      await api("/api/accounting/tresorerie/budget/copy", { method: "POST", json: { year, from } });
      toast.success(`Budget ${year} repris de ${year - 1}`);
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setCopy(null);
    }
  }

  const over = comparison.filter((c) => c.overBudget).length;
  const warn = comparison.filter((c) => c.warning).length;

  const table = (direction: "IN" | "OUT") => {
    const items = comparison.filter((c) => c.direction === direction);
    return (
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <h2 className="px-5 py-4 text-lg font-semibold text-ink">{direction === "IN" ? "Entrées" : "Sorties"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-sunken text-left text-ink-muted">
                <th className="px-4 py-2 font-semibold">Catégorie</th>
                <th className="px-4 py-2 text-right font-semibold">Budget {year}</th>
                <th className="px-4 py-2 text-right font-semibold">Réalisé</th>
                <th className="px-4 py-2 text-right font-semibold">Écart à date</th>
                <th className="w-1/4 px-4 py-2 font-semibold">Avancement</th>
                <th className="px-4 py-2 text-right font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.categoryId} className={`border-t border-line ${c.overBudget ? "bg-danger-soft" : ""}`}>
                  <td className="px-4 py-3 text-ink">
                    {c.name}{" "}
                    {c.overBudget && <StatusChip tone="danger">Dépassé de {euro(c.yearActual - c.annualBudget)}</StatusChip>}
                    {c.warning && <StatusChip tone="warning">À surveiller</StatusChip>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <Input
                        aria-label={`Budget ${year} : ${c.name}`}
                        inputMode="decimal"
                        className="text-right"
                        value={values[c.categoryId] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [c.categoryId]: e.target.value }))}
                      />
                    ) : (
                      euro(c.annualBudget)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{euro(c.yearActual)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{euro(c.ytd.gap)}</td>
                  <td className="px-4 py-3"><Bar ratio={c.yearRatio} tone={toneOf(c)} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(c.yearRatio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Année" className="flex items-center gap-2 text-sm">
          <Link className="font-semibold text-brand-text" href={`/accounting/tresorerie?onglet=budget&annee=${year - 1}`}>← {year - 1}</Link>
          <span className="text-lg font-semibold text-ink">{year}</span>
          <Link className="font-semibold text-brand-text" href={`/accounting/tresorerie?onglet=budget&annee=${year + 1}`}>{year + 1} →</Link>
        </nav>
        {over > 0 && <StatusChip tone="danger">{over} dépassement{over > 1 ? "s" : ""}</StatusChip>}
        {warn > 0 && <StatusChip tone="warning">{warn} à surveiller</StatusChip>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setCopy("budget")} disabled={busy}>Reprendre le budget {year - 1}</Button>
          <Button variant="secondary" onClick={() => setCopy("actual")} disabled={busy}>Reprendre le réalisé {year - 1}</Button>
          {editing ? (
            <Button onClick={() => void save()} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le budget"}</Button>
          ) : (
            <Button onClick={() => setEditing(true)}>Modifier le budget</Button>
          )}
        </div>
      </div>
      <p className="text-sm text-ink-muted">Montants annuels, répartis également sur les 12 mois. Le réalisé vient du registre, sans les transferts entre comptes.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      {table("IN")}
      {table("OUT")}
      <ConfirmModal
        open={copy !== null}
        title={`Reprendre ${copy === "actual" ? "le réalisé" : "le budget"} ${year - 1} ?`}
        message={`Le budget ${year} des catégories reprises sera remplacé ; vous pourrez l'ajuster ensuite.`}
        confirmLabel="Reprendre"
        confirmingLabel="Reprise…"
        variant="primary"
        confirming={busy}
        onConfirm={() => {
          if (copy) void copyFrom(copy);
        }}
        onCancel={() => setCopy(null)}
      />
    </div>
  );
}
