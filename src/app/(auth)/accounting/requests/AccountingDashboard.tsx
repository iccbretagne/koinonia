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
  SUBMITTED:  "bg-amber-100 text-amber-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  APPROVED:   "bg-emerald-100 text-emerald-800",
  REJECTED:   "bg-red-100 text-red-600",
  CANCELLED:  "bg-gray-100 text-gray-500",
};

interface Request {
  id: string;
  type: string;
  label: string;
  amount: number | string;
  status: string;
  priority: string | null;
  createdAt: string | Date;
  department: { id: string; name: string };
  submittedBy: { id: string; name: string | null };
  payments: { id: string; amount: number | string; scheduledDate: string | Date; releasedAt: string | Date | null }[];
  _count: { attachments: number };
}

interface Stats {
  submitted: number;
  processing: number;
  approved: number;
  totalAmount: number;
  pendingPayments: number;
}

interface Props {
  requests: Request[];
  stats: Stats;
  canManage: boolean;
  currentUserId: string;
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
        const hay = `${r.label} ${r.department.name} ${r.submittedBy.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-5">

      {/* Statistiques */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "En attente",     value: stats.submitted,     color: "text-amber-600" },
          { label: "En traitement",  value: stats.processing,    color: "text-blue-600" },
          { label: "Validées",       value: stats.approved,      color: "text-emerald-600" },
          { label: "Paiements dus",  value: stats.pendingPayments, color: "text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bandeau "À traiter" */}
      {actionable.length > 0 && (
        <div className="bg-icc-violet/5 border border-icc-violet/20 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-icc-violet flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-icc-violet animate-pulse" />
            À traiter
            <span className="text-icc-violet/60 font-normal">({actionable.length})</span>
          </h2>
          <div className="space-y-1.5">
            {actionable.slice(0, 5).map((r) => {
              const days = daysSince(r.createdAt);
              return (
                <Link
                  key={r.id}
                  href={`/accounting/requests/${r.id}`}
                  className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100 hover:border-icc-violet/40 hover:shadow-sm transition-all group"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{r.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.department.name} · {fmtAmount(r.amount)} ·{" "}
                      <span className={days >= 7 ? "text-amber-600 font-medium" : ""}>{days}j</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-icc-violet bg-icc-violet/10 px-2.5 py-1 rounded-full group-hover:bg-icc-violet group-hover:text-white transition-colors whitespace-nowrap">
                    {r.status === "SUBMITTED" ? "Prendre en charge →" : "Valider →"}
                  </span>
                </Link>
              );
            })}
            {actionable.length > 5 && (
              <p className="text-xs text-gray-400 text-center pt-0.5">+ {actionable.length - 5} autres</p>
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
                    ? "bg-icc-violet text-white border-icc-violet"
                    : "border-gray-200 text-gray-600 hover:border-icc-violet hover:text-icc-violet"
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
                    ? "bg-gray-800 text-white border-gray-800"
                    : "border-gray-200 text-gray-600 hover:border-gray-400"
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
          className="w-56 shrink-0 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Aucune demande.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Demande</th>
                  <th className="px-4 py-3 font-medium">Département</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Depuis</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const days = daysSince(r.createdAt);
                  const isOwn = r.submittedBy.id === currentUserId;
                  const pendingPmts = r.payments.filter((p) => !p.releasedAt).length;
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${isOwn ? "bg-icc-violet/[0.02]" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-xs">{r.label}</p>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-400">{TYPE_LABELS[r.type]}</span>
                          {r.priority === "URGENT" && (
                            <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">Urgent</span>
                          )}
                          {isOwn && (
                            <span className="text-xs text-icc-violet bg-icc-violet/10 px-1.5 py-0.5 rounded font-medium">Vous</span>
                          )}
                          {r._count.attachments > 0 && (
                            <span className="text-xs text-gray-400">📎 {r._count.attachments}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.department.name}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmtAmount(r.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {pendingPmts > 0 && (
                          <p className="text-xs text-amber-600 mt-0.5">{pendingPmts} paiement{pendingPmts > 1 ? "s" : ""} à confirmer</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${days >= 7 ? "text-amber-600 font-semibold" : "text-gray-400"}`}>{days}j</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/accounting/requests/${r.id}`}
                          className="text-xs font-medium text-icc-violet border border-icc-violet/40 px-2.5 py-1 rounded-full hover:bg-icc-violet hover:text-white transition-colors whitespace-nowrap"
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
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((r) => {
              const days = daysSince(r.createdAt);
              return (
                <Link key={r.id} href={`/accounting/requests/${r.id}`} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate">{r.label}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                        <span className="text-xs text-gray-500">{fmtAmount(r.amount)}</span>
                        <span className="text-xs text-gray-400">{r.department.name}</span>
                      </div>
                    </div>
                    <span className={`text-xs shrink-0 mt-0.5 ${days >= 7 ? "text-amber-600 font-semibold" : "text-gray-400"}`}>{days}j</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        {filtered.length} demande{filtered.length !== 1 ? "s" : ""} · Total engagé : {fmtAmount(stats.totalAmount)}
      </p>
    </div>
  );
}
