"use client";

import { TREASURY_TABS, type TreasuryTab } from "./tabs";
import { PageHeader, Tabs } from "@/components/ui";
import type {
  AccountView,
  BudgetComparison,
  BudgetRow,
  CategoryView,
  ChequeInHand,
  LedgerResult,
  PurposeView,
  Reports,
} from "@/modules/treasury";
import BudgetTab from "./BudgetTab";
import ClosureTab, { type ClosureData } from "./ClosureTab";
import CollectionTab from "./CollectionTab";
import DashboardTab, { type Dashboard } from "./DashboardTab";
import DepositTab from "./DepositTab";
import LedgerTab, { type LedgerFilters } from "./LedgerTab";
import ReportsTab from "./ReportsTab";
import SettingsTab from "./SettingsTab";


const TAB_LABEL: Record<TreasuryTab, string> = {
  tableau: "Tableau de bord",
  registre: "Registre",
  collecte: "Collecte",
  remise: "Remise",
  budget: "Budget",
  rapports: "Rapports",
  cloture: "Clôture",
  reglages: "Réglages",
};

export interface TreasuryData {
  dashboard: Dashboard | null;
  ledger: LedgerResult | null;
  reports: Reports | null;
  services: { id: string; title: string; date: string }[];
  cheques: ChequeInHand[];
  budget: { year: number; rows: BudgetRow[]; comparison: BudgetComparison[] } | null;
  closures: ClosureData | null;
  closureLedger: LedgerResult | null;
}

/** Écran de la trésorerie (spec 076) : un onglet par tâche, reflété dans l'URL (`?onglet=`). */
export default function TreasuryClient({
  tab,
  accounts,
  categories,
  purposes,
  canReopen,
  data,
  filters,
  highlightId,
}: {
  readonly tab: TreasuryTab;
  readonly accounts: AccountView[];
  readonly categories: CategoryView[];
  readonly purposes: PurposeView[];
  readonly canReopen: boolean;
  readonly data: TreasuryData;
  readonly filters: LedgerFilters;
  readonly highlightId?: string;
}) {
  const activeAccounts = accounts.filter((a) => !a.archived);
  const noAccount = accounts.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Comptabilité" title="Trésorerie" description="Entrées, sorties et soldes des comptes de l'église." />
      <Tabs
        ariaLabel="Trésorerie"
        tabs={TREASURY_TABS.map((t) => ({ href: `/accounting/tresorerie?onglet=${t}`, label: TAB_LABEL[t], active: t === tab }))}
      />
      {noAccount && tab !== "reglages" ? (
        <SettingsTab accounts={accounts} categories={categories} purposes={purposes} firstRun />
      ) : (
        <>
          {tab === "tableau" && data.dashboard && <DashboardTab dashboard={data.dashboard} />}
          {tab === "registre" && data.ledger && (
            <LedgerTab
              ledger={data.ledger}
              accounts={accounts}
              activeAccounts={activeAccounts}
              categories={categories}
              purposes={purposes}
              filters={filters}
              highlightId={highlightId}
            />
          )}
          {tab === "collecte" && (
            <CollectionTab accounts={activeAccounts} categories={categories} purposes={purposes} services={data.services} />
          )}
          {tab === "remise" && <DepositTab accounts={activeAccounts} cheques={data.cheques} />}
          {tab === "budget" && data.budget && <BudgetTab categories={categories} {...data.budget} />}
          {tab === "rapports" && data.reports && <ReportsTab reports={data.reports} from={filters.from} to={filters.to} />}
          {tab === "cloture" && data.closures && data.closureLedger && (
            <ClosureTab data={data.closures} ledger={data.closureLedger} canReopen={canReopen} />
          )}
          {tab === "reglages" && <SettingsTab accounts={accounts} categories={categories} purposes={purposes} />}
        </>
      )}
    </div>
  );
}
