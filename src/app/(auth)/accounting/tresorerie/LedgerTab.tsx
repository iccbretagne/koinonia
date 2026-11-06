"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Download, Paperclip, Plus } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmModal,
  DataTable,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusChip,
  buttonClasses,
  useToast,
} from "@/components/ui";
import type { AccountView, CategoryView, LedgerLine, LedgerResult, PurposeView } from "@/modules/treasury";
import { METHODS, METHOD_LABEL } from "@/modules/treasury/schemas";
import EntryForm from "./EntryForm";
import TransferForm from "./TransferForm";
import { api, errorText, euro, frDate } from "./format";

export interface LedgerFilters {
  accountId?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  method?: string;
}

interface HistoryItem {
  id: string;
  action: string;
  at: string;
  by: string;
}

const ACTION_LABEL: Record<string, string> = { CREATE: "Créée", UPDATE: "Corrigée", DELETE: "Supprimée" };
const DELETE_MESSAGE: Record<LedgerLine["kind"], string> = {
  TRANSFER: "Les deux lignes du transfert seront supprimées. Elles restent visibles dans l'historique.",
  DEPOSIT: "Les chèques de cette remise reviendront en caisse. La ligne reste visible dans l'historique.",
  STANDARD: "Elle sort des soldes et reste visible dans l'historique.",
};
const SOURCE_LABEL = { treasury: "", accounting: "Repris de la comptabilité", shuttle: "Repris de la navette" } as const;

function categoryOf(l: LedgerLine) {
  if (l.kind === "TRANSFER") return "Transfert";
  return [l.categoryName, l.purposeName].filter(Boolean).join(" · ");
}

/** Détail d'une ligne : justificatif, historique, actions (les lignes reprises sont en lecture seule). */
function EntryDetail({
  line,
  onClose,
  onEdit,
  onEditTransfer,
}: {
  readonly line: LedgerLine;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onEditTransfer: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = line.source === "treasury";

  async function loadHistory() {
    try {
      setHistory(await api<HistoryItem[]>(`/api/accounting/tresorerie/entries/${line.id}/history`));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/accounting/tresorerie/entries/${line.id}`, { method: "DELETE" });
      toast.success("Ligne supprimée");
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorText(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Date", frDate(line.date)],
    ["Compte", line.accountName],
    ["Sens", line.direction === "IN" ? "Entrée" : "Sortie"],
    ["Montant", euro(line.amount)],
    ["Catégorie", categoryOf(line)],
    ["Moyen", METHOD_LABEL[line.method]],
    ...(line.thirdParty ? [["Tiers", line.thirdParty] as [string, string]] : []),
    ...(line.depositRef ? [["Bordereau", line.depositRef] as [string, string]] : []),
    ["Solde après la ligne", euro(line.runningBalance)],
  ];

  return (
    <Modal open onClose={onClose} title={line.label}>
      <div className="space-y-4 p-1">
        {!own && (
          <Alert tone="info" title={SOURCE_LABEL[line.source]}>
            Cette ligne se modifie à son origine.{" "}
            {line.link && <Link href={line.link} className="font-semibold underline">Ouvrir l&apos;origine</Link>}
          </Alert>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {line.hasReceipt && (
          <a href={`/api/accounting/tresorerie/entries/${line.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-text">
            <Paperclip aria-hidden className="h-4 w-4" /> Voir le justificatif
          </a>
        )}
        {own && (
          <div>
            {history === null ? (
              <Button variant="ghost" size="sm" onClick={() => void loadHistory()}>Voir l&apos;historique</Button>
            ) : (
              <ul className="space-y-1 text-sm text-ink-muted">
                {history.map((h) => (
                  <li key={h.id}>{ACTION_LABEL[h.action] ?? h.action} le {new Date(h.at).toLocaleString("fr-FR")} par {h.by}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {own && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="danger" onClick={() => setConfirm(true)}>Supprimer</Button>
            {line.kind === "STANDARD" && <Button variant="secondary" onClick={onEdit}>Corriger</Button>}
            {line.kind === "TRANSFER" && <Button variant="secondary" onClick={onEditTransfer}>Corriger le transfert</Button>}
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirm}
        title="Supprimer cette ligne ?"
        message={DELETE_MESSAGE[line.kind]}
        confirmLabel="Supprimer"
        confirmingLabel="Suppression…"
        variant="danger"
        confirming={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(false)}
      />
    </Modal>
  );
}

/** Registre : filtres, synthèse de période, lignes avec le solde après chaque ligne. */
export default function LedgerTab({
  ledger,
  accounts,
  activeAccounts,
  categories,
  purposes,
  filters,
  highlightId,
}: {
  readonly ledger: LedgerResult;
  readonly accounts: AccountView[];
  readonly activeAccounts: AccountView[];
  readonly categories: CategoryView[];
  readonly purposes: PurposeView[];
  readonly filters: LedgerFilters;
  readonly highlightId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [detailId, setDetailId] = useState<string | null>(highlightId ?? null);
  const [editing, setEditing] = useState<LedgerLine | "new" | null>(null);
  const [transfer, setTransfer] = useState<LedgerLine | "new" | null>(null);
  const detail = ledger.lines.find((l) => l.id === detailId) ?? null;

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("onglet", "registre");
    router.push(`${pathname}?${params.toString()}`);
  }

  const exportHref = `/api/accounting/tresorerie/export?${new URLSearchParams({
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  }).toString()}`;

  const transferEdit = (() => {
    if (!transfer || transfer === "new" || !transfer.transferGroupId) return undefined;
    const twin = ledger.lines.find((l) => l.transferGroupId === transfer.transferGroupId && l.id !== transfer.id);
    const out = transfer.direction === "OUT" ? transfer : twin;
    const inn = transfer.direction === "IN" ? transfer : twin;
    return {
      groupId: transfer.transferGroupId,
      fromId: out?.accountId ?? "",
      toId: inn?.accountId ?? "",
      date: transfer.date,
      amount: transfer.amount,
      label: "",
    };
  })();

  const p = ledger.period;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Compte"
          value={filters.accountId ?? ""}
          onChange={(e) => setFilter("compte", e.target.value)}
          options={[{ value: "", label: "Tous les comptes" }, ...accounts.map((a) => ({ value: a.id, label: a.archived ? `${a.name} (archivé)` : a.name }))]}
        />
        <Input label="Du" type="date" value={filters.from ?? ""} onChange={(e) => setFilter("du", e.target.value)} />
        <Input label="Au" type="date" value={filters.to ?? ""} onChange={(e) => setFilter("au", e.target.value)} />
        <Select
          label="Catégorie"
          value={filters.categoryId ?? ""}
          onChange={(e) => setFilter("categorie", e.target.value)}
          options={[{ value: "", label: "Toutes" }, ...categories.map((c) => ({ value: c.id, label: `${c.direction === "IN" ? "Entrée" : "Sortie"} · ${c.name}` }))]}
        />
        <Select
          label="Moyen"
          value={filters.method ?? ""}
          onChange={(e) => setFilter("moyen", e.target.value)}
          options={[{ value: "", label: "Tous" }, ...METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={exportHref} className={buttonClasses("secondary", "md")}>
            <Download aria-hidden className="h-4 w-4" /> Exporter
          </a>
          {activeAccounts.length > 1 && (
            <Button variant="secondary" onClick={() => setTransfer("new")}>
              <ArrowLeftRight aria-hidden className="h-4 w-4" /> Transfert
            </Button>
          )}
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden className="h-4 w-4" /> Ajouter un mouvement
          </Button>
        </div>
      </div>

      {ledger.warnings.map((w) => (
        <Alert key={w.accountId} tone="danger" title={`${w.accountName} passe sous zéro le ${frDate(w.date)}`}>
          Solde de {euro(w.balance)} : une caisse ne peut pas être négative. Vérifiez les saisies.
        </Alert>
      ))}

      <section className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface md:grid-cols-4 md:divide-x md:divide-line">
        {[
          ["Solde d'ouverture", p.opening, "text-ink"],
          ["Entrées", p.inflows, "text-success"],
          ["Sorties", p.outflows, "text-danger"],
          ["Solde de clôture", p.closing, "text-brand-text"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="p-4">
            <p className="text-sm text-ink-muted">{label as string}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${tone as string}`}>{euro(value as number)}</p>
          </div>
        ))}
      </section>

      <DataTable
        data={ledger.lines}
        highlightedId={highlightId}
        emptyState={<EmptyState title="Aucune ligne sur cette période" description="Ajoutez un mouvement ou saisissez une collecte." />}
        columns={[
          { header: "Date", accessor: (l) => frDate(l.date) },
          {
            header: "Libellé",
            primary: true,
            accessor: (l) => (
              <button type="button" className="text-left font-semibold text-ink hover:text-brand-text" onClick={() => setDetailId(l.id)}>
                {l.label}
                {l.source !== "treasury" && <StatusChip tone="info" className="ml-2">Repris</StatusChip>}
                {l.hasReceipt && <Paperclip aria-label="Justificatif" className="ml-1 inline h-3.5 w-3.5 text-ink-subtle" />}
              </button>
            ),
          },
          { header: "Compte", accessor: (l) => l.accountName, hideOnMobile: true },
          { header: "Catégorie", accessor: categoryOf, hideOnMobile: true },
          { header: "Moyen", accessor: (l) => METHOD_LABEL[l.method], hideOnMobile: true },
          { header: "Entrée", align: "right", accessor: (l) => (l.direction === "IN" ? <span className="text-success">{euro(l.amount)}</span> : "") },
          { header: "Sortie", align: "right", accessor: (l) => (l.direction === "OUT" ? <span className="text-danger">{euro(l.amount)}</span> : "") },
          { header: "Solde", align: "right", accessor: (l) => <span className={l.runningBalance < 0 ? "text-danger" : ""}>{euro(l.runningBalance)}</span> },
        ]}
      />

      {detail && (
        <EntryDetail
          key={detail.id}
          line={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditing(detail);
            setDetailId(null);
          }}
          onEditTransfer={() => {
            setTransfer(detail);
            setDetailId(null);
          }}
        />
      )}
      {editing && (
        <EntryForm
          line={editing === "new" ? null : editing}
          accounts={activeAccounts}
          categories={categories}
          purposes={purposes}
          onClose={() => setEditing(null)}
        />
      )}
      {transfer && <TransferForm accounts={activeAccounts} edit={transferEdit} onClose={() => setTransfer(null)} />}
    </div>
  );
}
