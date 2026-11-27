"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Paperclip } from "lucide-react";
import {
  Alert,
  Button,
  CountBadge,
  DataTable,
  EmptyState,
  FilterChip,
  SearchInput,
  StatusChip,
  buttonClasses,
  type StatusTone,
} from "@/components/ui";

const TILE = "rounded-card border border-line bg-surface px-4 py-3 shadow-card";

const TYPE_LABELS: Record<string, string> = {
  EXPENSE_REPORT: "Note de frais",
  BUDGET_ADVANCE: "Avance de budget",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:  "En attente",
  PROCESSING: "En traitement",
  APPROVED:   "Validée",
  REJECTED:   "Rejetée",
  CANCELLED:  "Annulée",
};

const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED:  "warning",
  PROCESSING: "info",
  APPROVED:   "success",
  REJECTED:   "danger",
  CANCELLED:  "neutral",
};

interface Request {
  id: string;
  type: string;
  label: string;
  amount: number | string;
  status: string;
  priority: string | null;
  createdAt: string | Date;
  department: { id: string; name: string } | null;
  submittedBy: { id: string; name: string | null };
  payments: { id: string; amount: number | string; scheduledDate: string | Date; releasedAt: string | Date | null }[];
  _count: { attachments: number };
  /** Justificatifs encore ouverts (spec 078), sinon `null`. */
  justification: { status: string; late: boolean } | null;
  /** Arriéré : versée avant le suivi, justificatifs jamais demandés (compta seulement). */
  claimable?: boolean;
  /** Pièce demandée par la compta et pas encore déposée (spec 086). */
  pieceRequestedAt?: string | Date | null;
  /** Archivée (spec 089) : close d'office, ou à la main sans action de la compta en attente. */
  archived?: boolean;
}

interface Stats {
  submitted: number;
  processing: number;
  approved: number;
  rejected: number;
  totalAmount: number;
  pendingPayments: number;
  toJustify: number;
}

interface Props {
  readonly requests: Request[];
  readonly stats: Stats;
  readonly canManage: boolean;
  readonly currentUserId: string;
}

/** Pastille des justificatifs (spec 078). */
function JustificationPill({ j, claimable }: { readonly j: Request["justification"]; readonly claimable?: boolean }) {
  if (!j) {
    return claimable ? <StatusChip tone="neutral">Justificatifs non demandés</StatusChip> : null;
  }
  let label = "Justificatifs attendus";
  let tone: StatusTone = "warning";
  if (j.late) { label = "Justificatifs en retard"; tone = "danger"; }
  else if (j.status === "SUBMITTED") { label = "Justificatifs à vérifier"; tone = "info"; }
  else if (j.status === "RETURN_DUE") label = "Reliquat à rendre";
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

/** Ordre du filtre « À justifier » : retards, à vérifier, reliquats, puis le reste. */
function justifyRank(j: Request["justification"]) {
  if (!j) return 9;
  if (j.late) return 0;
  if (j.status === "SUBMITTED") return 1;
  if (j.status === "RETURN_DUE") return 2;
  return 3;
}

function daysSince(d: Date | string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function fmtAmount(n: number | string) {
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const STATUS_FILTERS = [
  { value: "",           label: "En cours" },
  { value: "SUBMITTED",  label: "En attente" },
  { value: "PROCESSING", label: "En traitement" },
  { value: "APPROVED",   label: "Validées" },
  { value: "REJECTED",   label: "Rejetées" },
  { value: "CANCELLED",  label: "Annulées" },
  { value: "JUSTIFY",    label: "À justifier" },
  { value: "ARCHIVED",   label: "Archivées" },
];

export default function AccountingDashboard({ requests, stats, canManage, currentUserId }: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const router = useRouter();
  const [claiming, setClaiming] = useState<string | null>(null);
  const awaitingPiece = useMemo(() => requests.filter((r) => r.pieceRequestedAt).length, [requests]);
  const arrears = useMemo(() => requests.filter((r) => r.claimable), [requests]);

  /** Réclame les justificatifs de tout l'arriéré, une demande après l'autre (spec 078). */
  async function claimAll() {
    let done = 0;
    let failed = 0;
    for (const r of arrears) {
      setClaiming(`${done + failed + 1} / ${arrears.length}`);
      const res = await fetch(`/api/accounting/requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claimJustification" }),
      }).catch(() => null);
      if (res?.ok) done++;
      else failed++;
    }
    setClaiming(failed ? `${done} ${done > 1 ? "réclamées" : "réclamée"}, ${failed} en échec` : null);
    setStatusFilter("JUSTIFY");
    router.refresh();
  }

  const actionable = useMemo(
    () => canManage ? requests.filter((r) => r.status === "SUBMITTED" || r.status === "PROCESSING") : [],
    [requests, canManage]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = requests.filter((r) => {
      // Archivées (spec 089) : seulement sous leur filtre, sauf l'arriéré (à réclamer).
      if (statusFilter === "ARCHIVED") { if (!r.archived) return false; }
      else if (r.archived && statusFilter !== "ARREARS") return false;
      if (statusFilter === "ARCHIVED") { /* déjà filtré */ }
      else if (statusFilter === "JUSTIFY") { if (!r.justification) return false; }
      else if (statusFilter === "PIECE") { if (!r.pieceRequestedAt) return false; }
      else if (statusFilter === "ARREARS") { if (!r.claimable) return false; }
      else if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (q) {
        const hay = `${r.label} ${r.department?.name ?? ""} ${r.submittedBy.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return statusFilter === "JUSTIFY" ? list.sort((a, b) => justifyRank(a.justification) - justifyRank(b.justification)) : list;
  }, [requests, statusFilter, typeFilter, search]);

  const statusFilters = [
    ...STATUS_FILTERS,
    ...(awaitingPiece > 0 ? [{ value: "PIECE", label: `Pièce demandée (${awaitingPiece})` }] : []),
    ...(arrears.length > 0 ? [{ value: "ARREARS", label: `Arriéré (${arrears.length})` }] : []),
  ];
  const filtering = statusFilter !== "" || typeFilter !== "" || search.trim() !== "";

  return (
    <div className="flex flex-col gap-5">

      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "En attente",     value: stats.submitted,       color: "text-warning" },
          { label: "En traitement",  value: stats.processing,      color: "text-info" },
          { label: "Validées",       value: stats.approved,        color: "text-success" },
          { label: "Rejetées",       value: stats.rejected,        color: "text-danger" },
          { label: "Paiements dus",  value: stats.pendingPayments, color: "text-brand-text" },
          { label: "À justifier",    value: stats.toJustify,       color: "text-warning", filter: "JUSTIFY" },
        ].map((s) => s.filter ? (
          <button key={s.label} type="button" onClick={() => setStatusFilter(s.filter)} aria-pressed={statusFilter === s.filter}
            className={`${TILE} text-left transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{s.label}</p>
          </button>
        ) : (
          <div key={s.label} className={TILE}>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bandeau "À traiter" */}
      {actionable.length > 0 && (
        <section className="flex flex-col gap-3 rounded-card border border-brand/20 bg-brand-soft p-4" aria-labelledby="a-traiter">
          <h2 id="a-traiter" className="flex items-center gap-2 font-display text-[17px] font-semibold leading-6 text-ink">
            À traiter
            <CountBadge count={actionable.length} />
          </h2>
          <ul className="flex flex-col gap-1.5">
            {actionable.slice(0, 5).map((r) => {
              const days = daysSince(r.createdAt);
              return (
                <li key={r.id}>
                  <Link
                    href={`/accounting/requests/${r.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2.5 transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{r.label}</p>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                        {r.department?.name ?? "Personnel"} · {fmtAmount(r.amount)} ·{" "}
                        <span className={days >= 7 ? "font-semibold text-warning" : ""}>{days} j</span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-display text-[13px] font-semibold text-brand-text">
                      {r.status === "SUBMITTED" ? "Prendre en charge" : "Valider"}
                      <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {actionable.length > 5 && (
            <p className="text-center text-[13px] leading-[18px] text-ink-muted">
              Et {actionable.length - 5} {actionable.length - 5 > 1 ? "autres" : "autre"}
            </p>
          )}
        </section>
      )}

      {/* Filtres */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par état">
            {statusFilters.map((f) => (
              <FilterChip key={f.value} pressed={statusFilter === f.value} onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par type">
            {["", "EXPENSE_REPORT", "BUDGET_ADVANCE"].map((t) => (
              <FilterChip key={t} pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t === "" ? "Tous types" : TYPE_LABELS[t]}
              </FilterChip>
            ))}
          </div>
        </div>
        <SearchInput
          aria-label="Rechercher une demande"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full shrink-0 md:w-56"
        />
      </div>

      {statusFilter === "ARREARS" && arrears.length > 0 && (
        <Alert
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={claimAll} disabled={claiming?.includes("/") ?? false}>
              {claiming?.includes("/") ? `Envoi ${claiming}…` : `Réclamer les justificatifs (${arrears.length})`}
            </Button>
          }
        >
          Ces demandes ont été versées avant la mise en service du suivi : aucun justificatif n&apos;a été demandé.
          En les réclamant, chaque demandeur est prévenu, puis relancé chaque semaine.
          {claiming && !claiming.includes("/") && <span className="mt-1 block font-semibold text-danger">{claiming}</span>}
        </Alert>
      )}

      {/* Liste */}
      <DataTable
        data={filtered}
        emptyState={
          filtering ? (
            <EmptyState
              size="sm"
              title="Aucune demande pour ces filtres"
              action={
                <Button type="button" variant="secondary" onClick={() => { setStatusFilter(""); setTypeFilter(""); setSearch(""); }}>
                  Effacer les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState size="sm" title="Aucune demande en cours" />
          )
        }
        columns={[
          {
            header: "Demande",
            primary: true,
            accessor: (r) => {
              const isOwn = r.submittedBy.id === currentUserId;
              return (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="max-w-xs truncate font-semibold text-ink">{r.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-normal leading-[18px] text-ink-muted">{TYPE_LABELS[r.type]}</span>
                    {r.priority === "URGENT" && <StatusChip tone="danger">Urgent</StatusChip>}
                    {isOwn && <StatusChip tone="brand">Vous</StatusChip>}
                    <JustificationPill j={r.justification} claimable={r.claimable} />
                    {r._count.attachments > 0 && (
                      <span className="inline-flex items-center gap-1 text-[13px] font-normal leading-[18px] text-ink-muted">
                        <Paperclip aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                        <span className="sr-only">Pièces jointes :</span>
                        {r._count.attachments}
                      </span>
                    )}
                  </span>
                </div>
              );
            },
          },
          { header: "Département", accessor: (r) => <span className="text-ink-muted">{r.department?.name ?? "Personnel"}</span> },
          { header: "Montant", align: "right", accessor: (r) => <span className="whitespace-nowrap font-semibold tabular-nums text-ink">{fmtAmount(r.amount)}</span> },
          {
            header: "Statut",
            accessor: (r) => {
              const pendingPmts = r.payments.filter((p) => !p.releasedAt).length;
              return (
                <div className="flex flex-col items-start gap-0.5">
                  <StatusChip tone={STATUS_TONES[r.status] ?? "neutral"}>{STATUS_LABELS[r.status] ?? r.status}</StatusChip>
                  {pendingPmts > 0 && (
                    <span className="text-[13px] leading-[18px] text-warning">{pendingPmts} paiement{pendingPmts > 1 ? "s" : ""} à confirmer</span>
                  )}
                  {r.pieceRequestedAt && <span className="text-[13px] font-semibold leading-[18px] text-warning">Pièce demandée</span>}
                </div>
              );
            },
          },
          {
            header: "Depuis",
            accessor: (r) => {
              const days = daysSince(r.createdAt);
              return <span className={`text-[13px] tabular-nums ${days >= 7 ? "font-semibold text-warning" : "text-ink-muted"}`}>{days} j</span>;
            },
          },
        ]}
        actions={(r) => (
          <Link href={`/accounting/requests/${r.id}`} className={`${buttonClasses("ghost", "sm")} whitespace-nowrap`}>
            Ouvrir
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </Link>
        )}
      />

      <p className="text-right text-[13px] leading-[18px] text-ink-muted">
        {filtered.length} demande{filtered.length > 1 ? "s" : ""} · Total engagé : {fmtAmount(stats.totalAmount)}
      </p>
    </div>
  );
}
