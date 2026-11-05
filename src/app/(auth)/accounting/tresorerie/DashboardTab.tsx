"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, EmptyState, StatusChip, buttonClasses } from "@/components/ui";
import type { BudgetComparison, LedgerResult, PeriodSummary } from "@/modules/treasury";
import { euro, frDate, monthTitle } from "./format";

export interface Dashboard {
  month: string;
  accounts: LedgerResult["accounts"];
  total: number;
  period: PeriodSummary;
  previous: PeriodSummary;
  lastYear: PeriodSummary;
  recent: LedgerResult["lines"];
  warnings: LedgerResult["warnings"];
  chequesInHand: { count: number; total: number };
  toClose: string[];
  budget: BudgetComparison[];
}

function Delta({ now, before, label }: { readonly now: number; readonly before: number; readonly label: string }) {
  const diff = now - before;
  if (before === 0 && now === 0) return null;
  return (
    <span className="text-xs text-ink-subtle">
      {diff >= 0 ? "+" : "−"} {euro(Math.abs(diff))} {label}
    </span>
  );
}

function Figure({ label, value, previous, lastYear, tone }: {
  readonly label: string;
  readonly value: number;
  readonly previous?: number;
  readonly lastYear?: number;
  readonly tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? "text-ink"}`}>{euro(value)}</span>
      {previous !== undefined && <Delta now={value} before={previous} label="vs mois précédent" />}
      {lastYear !== undefined && <Delta now={value} before={lastYear} label="vs l'an dernier" />}
    </div>
  );
}

/** Tableau de bord : soldes, mois en cours, comparaisons, derniers mouvements, points à surveiller. */
export default function DashboardTab({ dashboard: d }: { readonly dashboard: Dashboard }) {
  const watch = [
    ...d.warnings.map((w) => ({ key: `neg-${w.accountId}`, href: `/accounting/tresorerie?onglet=registre&compte=${w.accountId}`, title: `${w.accountName} passe sous zéro`, text: `Solde de ${euro(w.balance)} le ${frDate(w.date)} : une caisse ne peut pas être négative.` })),
    ...(d.chequesInHand.count > 0
      ? [{ key: "cheques", href: "/accounting/tresorerie?onglet=remise", title: `${d.chequesInHand.count} chèque${d.chequesInHand.count > 1 ? "s" : ""} en caisse`, text: `${euro(d.chequesInHand.total)} à remettre au compte commun.` }]
      : []),
    ...d.budget.map((b) => ({
      key: `budget-${b.categoryId}`,
      href: "/accounting/tresorerie?onglet=budget",
      title: b.overBudget ? `${b.name} : budget dépassé` : `${b.name} : ${Math.round((b.yearRatio ?? 0) * 100)} % du budget`,
      text: `${euro(b.yearActual)} réalisés sur ${euro(b.annualBudget)} prévus cette année.`,
    })),
    ...(d.toClose.length > 0
      ? [{ key: "close", href: "/accounting/tresorerie?onglet=cloture", title: d.toClose.length === 1 ? `${monthTitle(d.toClose[0])} à clôturer` : `${d.toClose.length} mois à clôturer`, text: "Vérifiez les soldes, puis clôturez." }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card bg-brand p-5 text-on-brand">
          <p className="text-sm opacity-90">Total de la trésorerie</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{euro(d.total)}</p>
        </div>
        {d.accounts.map((a) => (
          <Link key={a.id} href={`/accounting/tresorerie?onglet=registre&compte=${a.id}`} className="rounded-card border border-line bg-surface p-5 shadow-card hover:bg-surface-sunken">
            <p className="text-sm text-ink-muted">{a.name}</p>
            <p className={`mt-2 text-xl font-semibold tabular-nums ${a.balance < 0 ? "text-danger" : "text-ink"}`}>{euro(a.balance)}</p>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex items-center gap-3 px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">{monthTitle(d.month)}, tous comptes</h2>
          </div>
          <div className="grid grid-cols-2 border-t border-line md:grid-cols-4 md:divide-x md:divide-line">
            <Figure label="Ouverture" value={d.period.opening} />
            <Figure label="Entrées" value={d.period.inflows} previous={d.previous.inflows} lastYear={d.lastYear.inflows} tone="text-success" />
            <Figure label="Sorties" value={d.period.outflows} previous={d.previous.outflows} lastYear={d.lastYear.outflows} tone="text-danger" />
            <Figure label="Clôture" value={d.period.closing} />
          </div>
          <div className="flex items-center border-t border-line px-5 py-3">
            <h3 className="font-semibold text-ink">Derniers mouvements</h3>
            <Link href="/accounting/tresorerie?onglet=registre" className="ml-auto text-sm font-semibold text-brand-text">Voir le registre</Link>
          </div>
          {d.recent.length === 0 ? (
            <EmptyState size="sm" title="Aucun mouvement ce mois-ci" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d.recent.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-12 shrink-0 text-ink-subtle">{frDate(l.date).slice(0, 5)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{l.label}</span>
                  {l.source !== "treasury" && <StatusChip tone="info">Repris</StatusChip>}
                  <span className={`shrink-0 font-semibold tabular-nums ${l.direction === "IN" ? "text-success" : "text-danger"}`}>
                    {l.direction === "IN" ? "+" : "−"} {euro(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-[1_1_300px] flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">À surveiller</h2>
          {watch.length === 0 ? (
            <p className="text-sm text-ink-muted">Rien à signaler.</p>
          ) : (
            watch.map((w) => (
              <Link key={w.key} href={w.href} className="rounded-card border border-line bg-surface p-4 hover:bg-surface-sunken">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <AlertTriangle aria-hidden className="h-4 w-4 text-warning" />
                  {w.title}
                </span>
                <span className="mt-1 block text-sm text-ink-muted">{w.text}</span>
              </Link>
            ))
          )}
          <Link href="/accounting/tresorerie?onglet=collecte" className={buttonClasses("primary", "md")}>
            Saisir une collecte
          </Link>
          {d.accounts.length === 0 && <Alert tone="info">Créez d&apos;abord un compte dans les réglages.</Alert>}
        </aside>
      </div>
    </div>
  );
}
