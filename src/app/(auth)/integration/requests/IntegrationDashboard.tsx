"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:      "En attente",
  ASSIGNED:       "Assigné",
  CONTACTED:      "Contacté",
  WHATSAPP_ADDED: "Ajouté dans le groupe WhatsApp famille",
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

const AGE_LABELS: Record<string, string> = {
  YOUTH:        "Jeune",
  YOUNG_ADULT:  "Jeune adulte",
  ADULT:        "Adulte",
  SENIOR:       "Senior",
};

const CHURCH_STATUS_LABELS: Record<string, string> = {
  VISITOR:  "Visiteur",
  REGULAR:  "Régulier",
  ENGAGED:  "Engagé",
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
}

interface Props {
  requests: Request[];
  isScoped: boolean;
}

export default function IntegrationDashboard({ requests, isScoped }: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (q) {
        const haystack = `${r.firstName} ${r.lastName} ${r.phone ?? ""} ${r.email ?? ""} ${r.assignedFamilyName ?? ""}`.toLowerCase();
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
    <div className="space-y-4">
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
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recherche */}
      <input
        type="search"
        placeholder="Rechercher par nom, téléphone, famille…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
      />

      {/* Message scope berger */}
      {isScoped && (
        <p className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          Affichage limité aux demandes de votre famille.
        </p>
      )}

      {/* Tableau */}
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
                  <th className="px-4 py-3 font-medium">Profil</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Famille</th>
                  <th className="px-4 py-3 font-medium">Berger</th>
                  <th className="px-4 py-3 font-medium">Soumis le</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                      {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                      {r.pastoralCareRequested && (
                        <span className="inline-block mt-0.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          Soin pastoral
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <p>{AGE_LABELS[r.ageRange] ?? r.ageRange}</p>
                      <p className="text-xs">{CHURCH_STATUS_LABELS[r.churchStatus] ?? r.churchStatus}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {r.assignedFamilyName ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {r.assignedBerger?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(r.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/integration/requests/${r.id}`}
                        className="text-icc-violet text-xs font-medium hover:underline whitespace-nowrap"
                      >
                        Voir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/integration/requests/${r.id}`}
                className="block px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                    {r.phone && <p className="text-xs text-gray-400 mt-0.5">{r.phone}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                      {r.pastoralCareRequested && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600">
                          Soin pastoral
                        </span>
                      )}
                    </div>
                    {r.assignedFamilyName && (
                      <p className="text-xs text-gray-500 mt-1">{r.assignedFamilyName}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(r.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">{filtered.length} demande{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
