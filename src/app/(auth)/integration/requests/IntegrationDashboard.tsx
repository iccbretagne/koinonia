"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:      "Reçue",
  WAITING_RECONTACT: "Attente de recontact",
  WAITING_MISSION:   "Attente département mission",
  ASSIGNED:       "Assigné",
  CONTACTED:      "Contacté",
  WHATSAPP_ADDED: "WhatsApp ajouté",
  INTEGRATED:     "Intégré",
  ABANDONED:      "Abandonné",
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:      "bg-warning-soft text-warning",
  WAITING_RECONTACT: "bg-warning-soft text-warning",
  WAITING_MISSION:   "bg-warning-soft text-warning",
  ASSIGNED:       "bg-info-soft text-info",
  CONTACTED:      "bg-info-soft text-info",
  WHATSAPP_ADDED: "bg-success-soft text-success",
  INTEGRATED:     "bg-success-soft text-success",
  ABANDONED:      "bg-surface-sunken text-ink-muted",
};

const STATUS_FILTERS = [
  { value: "", label: "Tous" },
  { value: "SUBMITTED", label: "Reçues" },
  { value: "WAITING_RECONTACT", label: "Attente recontact" },
  { value: "WAITING_MISSION", label: "Attente mission" },
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
  suggestedFamilyId: number | null;
  abandonReasonCode: string | null;
  /** Échéance de relance dépassée (calculée côté serveur, spec 051). */
  relanceDue: boolean;
}

// Motifs d'abandon (spec 051) — miroir client des libellés du module intégration.
const ABANDON_REASON_LABELS: Record<string, string> = {
  UNKNOWN_NUMBER: "Numéro inconnu",
  UNREACHABLE: "Injoignable",
  NO_LONGER_INTERESTED: "Ne souhaite plus",
  OTHER_CHURCH: "Autre église",
  MOVED: "A déménagé",
  DUPLICATE: "Doublon",
  OTHER: "Autre motif",
};

/** Cible de la relance d'une demande en attente (spec 051). */
function relanceTarget(status: string): string {
  return status === "WAITING_MISSION" ? "Relancer le département mission" : "Recontacter la personne";
}

/** Adresse que le géocodage n'a rattachée à aucune famille : candidate à l'attente mission. */
function isUnmatchedAddress(r: Request): boolean {
  return r.status === "SUBMITTED" && r.suggestedFamilyId === null;
}

interface Props {
  readonly requests: Request[];
  readonly isScoped: boolean;
  readonly canExport: boolean;
  readonly churchId: string;
  readonly currentUserId: string;
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

export default function IntegrationDashboard({
  requests,
  isScoped,
  canExport,
  churchId,
  currentUserId,
}: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const isIntegration = !isScoped;

  const actionable = useMemo(
    () => requests.filter((r) => getNextAction(r, isIntegration, currentUserId) !== null),
    [requests, isIntegration, currentUserId]
  );

  const toRelance = useMemo(() => requests.filter((r) => r.relanceDue), [requests]);

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

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      // On envoie les IDs déjà affichés, jamais les filtres : le fichier = l'écran.
      const res = await fetch("/api/integration/requests/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, requestIds: filtered.map((r) => r.id) }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `demandes-integration-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Erreur lors de l'export.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Bandeau "À traiter" */}
      {actionable.length > 0 && (
        <div className="bg-brand-soft border border-brand/20 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-brand-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            À traiter
            <span className="text-brand-text/60 font-normal">({actionable.length})</span>
          </h2>
          <div className="space-y-1.5">
            {actionable.slice(0, 6).map((r) => {
              const action = getNextAction(r, isIntegration, currentUserId)!;
              const days = daysSince(r.submittedAt);
              return (
                <Link
                  key={r.id}
                  href={`/integration/requests/${r.id}`}
                  className="flex items-center justify-between gap-3 bg-surface rounded-lg px-3 py-2.5 border border-line hover:border-brand/40 hover:shadow-card transition-all group"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink text-sm">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-xs text-ink-subtle mt-0.5">
                      {STATUS_LABELS[r.status]}
                      {r.assignedFamilyName ? ` · ${r.assignedFamilyName}` : ""}
                      {" · "}
                      <span className={days >= 7 ? "text-warning font-medium" : ""}>
                        {days}j
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-brand-text bg-brand-soft px-2.5 py-1 rounded-full group-hover:bg-brand group-hover:text-on-brand transition-colors whitespace-nowrap">
                    {action} →
                  </span>
                </Link>
              );
            })}
            {actionable.length > 6 && (
              <p className="text-xs text-ink-subtle text-center pt-0.5">
                + {actionable.length - 6} autres demandes à traiter
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bandeau "À relancer" : visible tant que la relance n'est pas consignée (spec 051) */}
      {toRelance.length > 0 && (
        <div className="bg-warning-soft border border-warning/30 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-warning flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning" />
            À relancer
            <span className="text-warning/60 font-normal">({toRelance.length})</span>
          </h2>
          <div className="space-y-1.5">
            {toRelance.map((r) => (
              <Link
                key={r.id}
                href={`/integration/requests/${r.id}`}
                className="flex items-center justify-between gap-3 bg-surface rounded-lg px-3 py-2.5 border border-line hover:border-warning/30 hover:shadow-card transition-all"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink text-sm">
                    {r.firstName} {r.lastName}
                  </p>
                  <p className="text-xs text-ink-subtle mt-0.5">{STATUS_LABELS[r.status]}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-warning bg-warning-soft px-2.5 py-1 rounded-full whitespace-nowrap">
                  {relanceTarget(r.status)} →
                </span>
              </Link>
            ))}
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
                  ? "bg-brand text-on-brand border-brand"
                  : "border-line text-ink-muted hover:border-brand hover:text-brand-text"
              }`}
            >
              {f.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  active ? "bg-surface/20" : "bg-surface-sunken text-ink-muted"
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
          className="w-full sm:w-80 border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
        {isScoped && (
          <p className="text-sm text-ink-muted bg-info-soft border border-info/30 rounded-lg px-3 py-2 self-start">
            Affichage limité aux demandes de votre famille.
          </p>
        )}
        {canExport && (
          <div className="sm:ml-auto flex flex-col sm:items-end gap-1">
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
            >
              {exporting ? "Export…" : `Exporter (${filtered.length})`}
            </Button>
            {exportError && <p className="text-xs text-danger">{exportError}</p>}
          </div>
        )}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-xl border border-line p-8 text-center text-ink-subtle text-sm">
          Aucune demande{statusFilter ? " avec ce statut" : ""}.
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left text-xs text-ink-muted uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Personne</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Famille · Berger</th>
                  <th className="px-4 py-3 font-medium">Depuis</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => {
                  const days = daysSince(r.submittedAt);
                  const isYours = r.assignedBerger?.id === currentUserId;
                  const nextAction = getNextAction(r, isIntegration, currentUserId);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-surface-sunken transition-colors ${isYours ? "bg-brand/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">
                          {r.firstName} {r.lastName}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {isYours && (
                            <span className="text-xs text-brand-text bg-brand-soft px-1.5 py-0.5 rounded font-medium">
                              Vous
                            </span>
                          )}
                          {r.pastoralCareRequested && (
                            <span className="text-xs text-warning bg-warning-soft px-1.5 py-0.5 rounded">
                              Soin pastoral
                            </span>
                          )}
                          {r.salvationCall && (
                            <span className="text-xs text-brand-text bg-brand-soft px-1.5 py-0.5 rounded">
                              Appel au salut
                            </span>
                          )}
                          {r.relanceDue && (
                            <span className="text-xs text-warning bg-warning-soft px-1.5 py-0.5 rounded font-medium">
                              À relancer
                            </span>
                          )}
                          {isIntegration && isUnmatchedAddress(r) && (
                            <span className="text-xs text-ink-muted bg-surface-sunken px-1.5 py-0.5 rounded">
                              Adresse non rattachée
                            </span>
                          )}
                          {r.status === "ABANDONED" && r.abandonReasonCode && (
                            <span className="text-xs text-ink-muted bg-surface-sunken px-1.5 py-0.5 rounded">
                              {ABANDON_REASON_LABELS[r.abandonReasonCode] ?? r.abandonReasonCode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[r.status] ?? "bg-surface-sunken text-ink-muted"
                          }`}
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {r.assignedFamilyName ? (
                          <div>
                            <p className="font-medium text-ink-muted">{r.assignedFamilyName}</p>
                            {r.assignedBerger?.name && (
                              <p className="text-ink-subtle">{r.assignedBerger.name}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs ${
                            days >= 7 ? "text-warning font-semibold" : "text-ink-subtle"
                          }`}
                        >
                          {days}j
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {nextAction ? (
                          <Link
                            href={`/integration/requests/${r.id}`}
                            className="text-xs font-medium text-brand-text bg-brand-soft px-2.5 py-1 rounded-full hover:bg-brand hover:text-on-brand transition-colors whitespace-nowrap"
                          >
                            {nextAction} →
                          </Link>
                        ) : (
                          <Link
                            href={`/integration/requests/${r.id}`}
                            className="text-xs font-medium text-brand-text border border-brand/40 px-2.5 py-1 rounded-full hover:bg-brand hover:text-on-brand transition-colors whitespace-nowrap"
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
          <div className="md:hidden divide-y divide-line">
            {filtered.map((r) => {
              const days = daysSince(r.submittedAt);
              const isYours = r.assignedBerger?.id === currentUserId;
              const nextAction = getNextAction(r, isIntegration, currentUserId);
              return (
                <Link
                  key={r.id}
                  href={`/integration/requests/${r.id}`}
                  className="block px-4 py-3 hover:bg-surface-sunken transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-ink">
                          {r.firstName} {r.lastName}
                        </p>
                        {isYours && (
                          <span className="text-xs text-brand-text bg-brand-soft px-1.5 py-0.5 rounded font-medium">
                            Vous
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[r.status] ?? "bg-surface-sunken text-ink-muted"
                          }`}
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {nextAction && (
                          <span className="text-xs font-medium text-brand-text bg-brand-soft px-2 py-0.5 rounded-full">
                            {nextAction} →
                          </span>
                        )}
                        {r.relanceDue && (
                          <span className="text-xs font-medium text-warning bg-warning-soft px-2 py-0.5 rounded-full">
                            À relancer
                          </span>
                        )}
                        {isIntegration && isUnmatchedAddress(r) && (
                          <span className="text-xs text-ink-muted bg-surface-sunken px-2 py-0.5 rounded-full">
                            Adresse non rattachée
                          </span>
                        )}
                      </div>
                      {r.assignedFamilyName && (
                        <p className="text-xs text-ink-muted mt-1">{r.assignedFamilyName}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs shrink-0 mt-0.5 ${
                        days >= 7 ? "text-warning font-semibold" : "text-ink-subtle"
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

      <p className="text-xs text-ink-subtle text-right">
        {filtered.length} demande{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
