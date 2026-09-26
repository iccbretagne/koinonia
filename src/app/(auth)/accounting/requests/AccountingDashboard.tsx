"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

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

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:  "bg-warning-soft text-warning",
  PROCESSING: "bg-info-soft text-info",
  APPROVED:   "bg-success-soft text-success",
  REJECTED:   "bg-danger-soft text-danger",
  CANCELLED:  "bg-surface-sunken text-ink-muted",
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
}

interface Stats {
  submitted: number;
  processing: number;
  approved: number;
  rejected: number;
  totalAmount: number;
  pendingPayments: number;
}

interface Props {
  readonly requests: Request[];
  readonly stats: Stats;
  readonly canManage: boolean;
  readonly currentUserId: string;
}

function daysSince(d: Date | string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function fmtAmount(n: number | string) {
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const STATUS_FILTERS = [
  { value: "",           label: "Toutes" },
  { value: "SUBMITTED",  label: "En attente" },
  { value: "PROCESSING", label: "En traitement" },
  { value: "APPROVED",   label: "Validées" },
  { value: "REJECTED",   label: "Rejetées" },
  { value: "CANCELLED",  label: "Annulées" },
];

export default function AccountingDashboard({ requests, stats, canManage, currentUserId }: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const actionable = useMemo(
    () => canManage ? requests.filter((r) => r.status === "SUBMITTED" || r.status === "PROCESSING") : [],
    [requests, canManage]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (q) {
        const hay = `${r.label} ${r.department?.name ?? ""} ${r.submittedBy.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-5">

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "En attente",     value: stats.submitted,       color: "text-warning" },
          { label: "En traitement",  value: stats.processing,      color: "text-info" },
          { label: "Validées",       value: stats.approved,        color: "text-success" },
          { label: "Rejetées",       value: stats.rejected,        color: "text-danger" },
          { label: "Paiements dus",  value: stats.pendingPayments, color: "text-brand-text" },
        ].map((s) => (
          <div key={s.label} className="bg-surface rounded-xl border border-line px-4 py-3">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-ink-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bandeau "À traiter" */}
      {actionable.length > 0 && (
        <div className="bg-brand-soft border border-brand/20 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-brand-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            À traiter
            <span className="text-brand-text/60 font-normal">({actionable.length})</span>
          </h2>
          <div className="space-y-1.5">
            {actionable.slice(0, 5).map((r) => {
              const days = daysSince(r.createdAt);
              return (
                <Link
                  key={r.id}
                  href={`/accounting/requests/${r.id}`}
                  className="flex items-center justify-between gap-3 bg-surface rounded-lg px-3 py-2.5 border border-line hover:border-brand/40 hover:shadow-card transition-all group"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink text-sm truncate">{r.label}</p>
                    <p className="text-xs text-ink-subtle mt-0.5">
                      {r.department?.name ?? "Personnel"} · {fmtAmount(r.amount)} ·{" "}
                      <span className={days >= 7 ? "text-warning font-medium" : ""}>{days}j</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-brand-text bg-brand-soft px-2.5 py-1 rounded-full group-hover:bg-brand-hover group-hover:text-on-brand transition-colors whitespace-nowrap">
                    {r.status === "SUBMITTED" ? "Prendre en charge →" : "Valider →"}
                  </span>
                </Link>
              );
            })}
            {actionable.length > 5 && (
              <p className="text-xs text-ink-subtle text-center pt-0.5">+ {actionable.length - 5} autres</p>
            )}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter === f.value
                    ? "bg-brand text-on-brand border-brand"
                    : "border-line text-ink-muted hover:border-brand hover:text-brand-text"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {["", "EXPENSE_REPORT", "BUDGET_ADVANCE"].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  typeFilter === t
                    ? "bg-brand text-on-brand border-brand"
                    : "border-line text-ink-muted hover:border-brand"
                }`}
              >
                {t === "" ? "Tous types" : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 shrink-0 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-xl border border-line p-8 text-center text-ink-subtle text-sm">
          Aucune demande.
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left text-xs text-ink-muted uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Demande</th>
                  <th className="px-4 py-3 font-medium">Département</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Depuis</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => {
                  const days = daysSince(r.createdAt);
                  const isOwn = r.submittedBy.id === currentUserId;
                  const pendingPmts = r.payments.filter((p) => !p.releasedAt).length;
                  return (
                    <tr key={r.id} className={`hover:bg-surface-sunken transition-colors ${isOwn ? "bg-brand/[0.02]" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink truncate max-w-xs">{r.label}</p>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-ink-subtle">{TYPE_LABELS[r.type]}</span>
                          {r.priority === "URGENT" && (
                            <span className="text-xs text-danger bg-danger-soft px-1.5 py-0.5 rounded font-medium">Urgent</span>
                          )}
                          {isOwn && (
                            <span className="text-xs text-brand-text bg-brand-soft px-1.5 py-0.5 rounded font-medium">Vous</span>
                          )}
                          {r._count.attachments > 0 && (
                            <span className="text-xs text-ink-subtle">📎 {r._count.attachments}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-muted">{r.department?.name ?? "Personnel"}</td>
                      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{fmtAmount(r.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-surface-sunken text-ink-muted"}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {pendingPmts > 0 && (
                          <p className="text-xs text-warning mt-0.5">{pendingPmts} paiement{pendingPmts > 1 ? "s" : ""} à confirmer</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${days >= 7 ? "text-warning font-semibold" : "text-ink-subtle"}`}>{days}j</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/accounting/requests/${r.id}`}
                          className="text-xs font-medium text-brand-text border border-brand/40 px-2.5 py-1 rounded-full hover:bg-brand-hover hover:text-on-brand transition-colors whitespace-nowrap"
                        >
                          Voir →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-line">
            {filtered.map((r) => {
              const days = daysSince(r.createdAt);
              return (
                <Link key={r.id} href={`/accounting/requests/${r.id}`} className="block px-4 py-3 hover:bg-surface-sunken transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink text-sm truncate">{r.label}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-surface-sunken text-ink-muted"}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                        <span className="text-xs text-ink-muted">{fmtAmount(r.amount)}</span>
                        <span className="text-xs text-ink-subtle">{r.department?.name ?? "Personnel"}</span>
                      </div>
                    </div>
                    <span className={`text-xs shrink-0 mt-0.5 ${days >= 7 ? "text-warning font-semibold" : "text-ink-subtle"}`}>{days}j</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-ink-subtle text-right">
        {filtered.length} demande{filtered.length !== 1 ? "s" : ""} · Total engagé : {fmtAmount(stats.totalAmount)}
      </p>
    </div>
  );
}
