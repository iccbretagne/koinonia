"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:      "En attente",
  ASSIGNED:       "Assigné",
  CONTACTED:      "Contacté",
  WHATSAPP_ADDED: "WhatsApp ajouté",
  INTEGRATED:     "Intégré",
  ABANDONED:      "Abandonné",
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:      "bg-amber-100 text-amber-800",
  ASSIGNED:       "bg-blue-100 text-blue-800",
  CONTACTED:      "bg-indigo-100 text-indigo-800",
  WHATSAPP_ADDED: "bg-green-100 text-green-700",
  INTEGRATED:     "bg-emerald-100 text-emerald-800",
  ABANDONED:      "bg-gray-100 text-gray-500",
};

const STATUS_FILTERS = [
  { value: "", label: "Tous" },
  { value: "SUBMITTED", label: "En attente" },
  { value: "ASSIGNED", label: "Assignés" },
  { value: "CONTACTED", label: "Contactés" },
  { value: "WHATSAPP_ADDED", label: "WhatsApp" },
  { value: "INTEGRATED", label: "Intégrés" },
  { value: "ABANDONED", label: "Abandonnés" },
];

interface Request {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  ageRange: string;
  churchStatus: string;
  status: string;
  submittedAt: Date | string;
  assignedFamilyName: string | null;
  assignedBerger: { id: string; name: string | null } | null;
  pastoralCareRequested: boolean;
  salvationCall: boolean;
}

interface Props {
  requests: Request[];
  isScoped: boolean;
  currentUserId: string;
}

function daysSince(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function getNextAction(
  req: Request,
  isIntegration: boolean,
  currentUserId: string
): string | null {
  if (req.status === "INTEGRATED" || req.status === "ABANDONED") return null;
  if (isIntegration && req.status === "SUBMITTED") return "Assigner";
  const isBerger = req.assignedBerger?.id === currentUserId;
  if (isBerger) {
    if (req.status === "ASSIGNED") return "Marquer contacté";
    if (req.status === "CONTACTED") return "Ajouter au groupe";
    if (req.status === "WHATSAPP_ADDED") return "Marquer intégré";
  }
  return null;
}

export default function IntegrationDashboard({ requests, isScoped, currentUserId }: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const isIntegration = !isScoped;

  const actionable = useMemo(
    () => requests.filter((r) => getNextAction(r, isIntegration, currentUserId) !== null),
    [requests, isIntegration, currentUserId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (q) {
        const haystack =
          `${r.firstName} ${r.lastName} ${r.phone ?? ""} ${r.email ?? ""} ${r.assignedFamilyName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  return (
    <div className="space-y-5">
      {/* Bandeau "À traiter" */}
      {actionable.length > 0 && (
        <div className="bg-icc-violet/5 border border-icc-violet/20 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-icc-violet flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-icc-violet animate-pulse" />
            À traiter
            <span className="text-icc-violet/60 font-normal">({actionable.length})</span>
          </h2>
          <div className="space-y-1.5">
            {actionable.slice(0, 6).map((r) => {
              const action = getNextAction(r, isIntegration, currentUserId)!;
              const days = daysSince(r.submittedAt);
              return (
                <Link
                  key={r.id}
                  href={`/integration/requests/${r.id}`}
                  className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100 hover:border-icc-violet/40 hover:shadow-sm transition-all group"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {STATUS_LABELS[r.status]}
                      {r.assignedFamilyName ? ` · ${r.assignedFamilyName}` : ""}
                      {" · "}
                      <span className={days >= 7 ? "text-amber-600 font-medium" : ""}>
                        {days}j
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-icc-violet bg-icc-violet/10 px-2.5 py-1 rounded-full group-hover:bg-icc-violet group-hover:text-white transition-colors whitespace-nowrap">
                    {action} →
                  </span>
                </Link>
              );
            })}
            {actionable.length > 6 && (
              <p className="text-xs text-gray-400 text-center pt-0.5">
                + {actionable.length - 6} autres demandes à traiter
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const count = f.value ? (counts[f.value] ?? 0) : requests.length;
          const active = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-icc-violet text-white border-icc-violet"
                  : "border-gray-200 text-gray-600 hover:border-icc-violet hover:text-icc-violet"
              }`}
            >
              {f.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  active ? "bg-white/20" : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recherche + scope notice */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          placeholder="Rechercher par nom, téléphone, famille…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
        />
        {isScoped && (
          <p className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 self-start">
            Affichage limité aux demandes de votre famille.
          </p>
        )}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Aucune demande{statusFilter ? " avec ce statut" : ""}.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Personne</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Famille · Berger</th>
                  <th className="px-4 py-3 font-medium">Depuis</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const days = daysSince(r.submittedAt);
                  const isYours = r.assignedBerger?.id === currentUserId;
                  const nextAction = getNextAction(r, isIntegration, currentUserId);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-gray-50 transition-colors ${isYours ? "bg-icc-violet/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {r.firstName} {r.lastName}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {isYours && (
                            <span className="text-xs text-icc-violet bg-icc-violet/10 px-1.5 py-0.5 rounded font-medium">
                              Vous
                            </span>
                          )}
                          {r.pastoralCareRequested && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              Soin pastoral
                            </span>
                          )}
                          {r.salvationCall && (
                            <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                              Appel au salut
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {r.assignedFamilyName ? (
                          <div>
                            <p className="font-medium text-gray-700">{r.assignedFamilyName}</p>
                            {r.assignedBerger?.name && (
                              <p className="text-gray-400">{r.assignedBerger.name}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs ${
                            days >= 7 ? "text-amber-600 font-semibold" : "text-gray-400"
                          }`}
                        >
                          {days}j
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {nextAction ? (
                          <Link
                            href={`/integration/requests/${r.id}`}
                            className="text-xs font-medium text-icc-violet bg-icc-violet/10 px-2.5 py-1 rounded-full hover:bg-icc-violet hover:text-white transition-colors whitespace-nowrap"
                          >
                            {nextAction} →
                          </Link>
                        ) : (
                          <Link
                            href={`/integration/requests/${r.id}`}
                            className="text-xs font-medium text-icc-violet border border-icc-violet/40 px-2.5 py-1 rounded-full hover:bg-icc-violet hover:text-white transition-colors whitespace-nowrap"
                          >
                            Voir →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((r) => {
              const days = daysSince(r.submittedAt);
              const isYours = r.assignedBerger?.id === currentUserId;
              const nextAction = getNextAction(r, isIntegration, currentUserId);
              return (
                <Link
                  key={r.id}
                  href={`/integration/requests/${r.id}`}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-gray-900">
                          {r.firstName} {r.lastName}
                        </p>
                        {isYours && (
                          <span className="text-xs text-icc-violet bg-icc-violet/10 px-1.5 py-0.5 rounded font-medium">
                            Vous
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {nextAction && (
                          <span className="text-xs font-medium text-icc-violet bg-icc-violet/10 px-2 py-0.5 rounded-full">
                            {nextAction} →
                          </span>
                        )}
                      </div>
                      {r.assignedFamilyName && (
                        <p className="text-xs text-gray-500 mt-1">{r.assignedFamilyName}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs shrink-0 mt-0.5 ${
                        days >= 7 ? "text-amber-600 font-semibold" : "text-gray-400"
                      }`}
                    >
                      {days}j
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        {filtered.length} demande{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
