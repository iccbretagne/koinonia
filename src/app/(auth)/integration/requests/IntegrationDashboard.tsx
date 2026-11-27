"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Alert, Button, EmptyState, FilterChip, SearchInput, StatusChip, buttonClasses, type StatusTone } from "@/components/ui";

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

const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED:      "warning",
  WAITING_RECONTACT: "warning",
  WAITING_MISSION:   "warning",
  ASSIGNED:       "info",
  CONTACTED:      "info",
  WHATSAPP_ADDED: "success",
  INTEGRATED:     "success",
  ABANDONED:      "neutral",
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    <div className="flex flex-col gap-5">
      {/* Bandeau "À traiter" */}
      {actionable.length > 0 && (
        <section aria-labelledby="integration-todo" className="flex flex-col gap-3">
          <h2 id="integration-todo" className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
            <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
            À traiter
            <span className="font-sans font-normal text-ink-muted">({actionable.length})</span>
          </h2>
          <ul className="flex flex-col gap-1.5">
            {actionable.slice(0, 6).map((r) => {
              const action = getNextAction(r, isIntegration, currentUserId)!;
              const days = daysSince(r.submittedAt);
              return (
                <li key={r.id}>
                  <Link href={`/integration/requests/${r.id}`} className={rowLinkClasses}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {r.firstName} {r.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {STATUS_LABELS[r.status]}
                        {r.assignedFamilyName ? ` · ${r.assignedFamilyName}` : ""}
                        {" · "}
                        <span className={days >= 7 ? "font-semibold text-warning" : ""}>{daysLabel(days)}</span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <StatusChip tone="brand">{action}</StatusChip>
                      <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {actionable.length > 6 && (
            <p className="text-center text-xs text-ink-muted">
              {actionable.length - 6 > 1
                ? `+ ${actionable.length - 6} autres demandes à traiter`
                : "+ 1 autre demande à traiter"}
            </p>
          )}
        </section>
      )}

      {/* Bandeau "À relancer" : visible tant que la relance n'est pas consignée (spec 051) */}
      {toRelance.length > 0 && (
        <section aria-labelledby="integration-relance" className="flex flex-col gap-3 rounded-card bg-warning-soft p-4">
          <h2 id="integration-relance" className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
            <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
            À relancer
            <span className="font-sans font-normal text-ink-muted">({toRelance.length})</span>
          </h2>
          <ul className="flex flex-col gap-1.5">
            {toRelance.map((r) => (
              <li key={r.id}>
                <Link href={`/integration/requests/${r.id}`} className={rowLinkClasses}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{STATUS_LABELS[r.status]}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <StatusChip tone="warning">{relanceTarget(r.status)}</StatusChip>
                    <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filtres statut */}
      <div role="group" aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const count = f.value ? (counts[f.value] ?? 0) : requests.length;
          return (
            <FilterChip key={f.value} pressed={statusFilter === f.value} onClick={() => setStatusFilter(f.value)}>
              {f.label}
              <span className="font-normal tabular-nums">{count}</span>
            </FilterChip>
          );
        })}
      </div>

      {/* Recherche + scope notice */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <SearchInput
          aria-label="Rechercher une demande"
          placeholder="Rechercher par nom, téléphone, famille…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80"
        />
        {isScoped && (
          <Alert tone="info" className="sm:self-start">Affichage limité aux demandes de votre famille.</Alert>
        )}
        {canExport && (
          <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
            >
              {exporting ? "Export en cours…" : `Exporter (${filtered.length})`}
            </Button>
            {filtered.length === 0 && <p className="text-[13px] text-ink-muted">Aucune demande à exporter.</p>}
            {exportError && <p className="text-[13px] text-danger">{exportError}</p>}
          </div>
        )}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          {statusFilter || search.trim() ? (
            <EmptyState
              size="sm"
              title="Aucune demande pour ces filtres"
              action={
                <Button type="button" variant="secondary" onClick={() => { setStatusFilter(""); setSearch(""); }}>
                  Effacer les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState size="sm" title="Aucune demande" description="Les demandes reçues par le formulaire d'accueil apparaîtront ici." />
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3 font-semibold">Personne</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold">Famille · Berger</th>
                  <th className="px-4 py-3 font-semibold">Depuis</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => {
                  const days = daysSince(r.submittedAt);
                  const isYours = r.assignedBerger?.id === currentUserId;
                  const nextAction = getNextAction(r, isIntegration, currentUserId);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-surface-sunken">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">
                          {r.firstName} {r.lastName}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {isYours && <StatusChip tone="brand">Vous</StatusChip>}
                          {r.pastoralCareRequested && <StatusChip tone="warning">Soin pastoral</StatusChip>}
                          {r.salvationCall && <StatusChip tone="brand">Appel au salut</StatusChip>}
                          {r.relanceDue && <StatusChip tone="warning">À relancer</StatusChip>}
                          {isIntegration && isUnmatchedAddress(r) && <StatusChip>Adresse non rattachée</StatusChip>}
                          {r.status === "ABANDONED" && r.abandonReasonCode && (
                            <StatusChip>{ABANDON_REASON_LABELS[r.abandonReasonCode] ?? r.abandonReasonCode}</StatusChip>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip tone={STATUS_TONES[r.status] ?? "neutral"}>{STATUS_LABELS[r.status] ?? r.status}</StatusChip>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {r.assignedFamilyName ? (
                          <div>
                            <p className="font-semibold text-ink">{r.assignedFamilyName}</p>
                            {r.assignedBerger?.name && <p>{r.assignedBerger.name}</p>}
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`text-xs tabular-nums ${days >= 7 ? "font-semibold text-warning" : "text-ink-muted"}`}>
                          {daysLabel(days)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/integration/requests/${r.id}`}
                          aria-label={`${nextAction ?? "Voir la demande"} — ${r.firstName} ${r.lastName}`}
                          className={`${buttonClasses("ghost", "sm")} whitespace-nowrap`}
                        >
                          {nextAction ?? "Voir"}
                          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : lignes entièrement cliquables */}
          <ul className="divide-y divide-line md:hidden">
            {filtered.map((r) => {
              const days = daysSince(r.submittedAt);
              const isYours = r.assignedBerger?.id === currentUserId;
              const nextAction = getNextAction(r, isIntegration, currentUserId);
              return (
                <li key={r.id}>
                  <Link
                    href={`/integration/requests/${r.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-ink">
                            {r.firstName} {r.lastName}
                          </p>
                          {isYours && <StatusChip tone="brand">Vous</StatusChip>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <StatusChip tone={STATUS_TONES[r.status] ?? "neutral"}>{STATUS_LABELS[r.status] ?? r.status}</StatusChip>
                          {nextAction && <StatusChip tone="brand">{nextAction}</StatusChip>}
                          {r.relanceDue && <StatusChip tone="warning">À relancer</StatusChip>}
                          {isIntegration && isUnmatchedAddress(r) && <StatusChip>Adresse non rattachée</StatusChip>}
                        </div>
                        {r.assignedFamilyName && <p className="mt-1 text-xs text-ink-muted">{r.assignedFamilyName}</p>}
                      </div>
                      <span className={`mt-0.5 shrink-0 text-xs tabular-nums ${days >= 7 ? "font-semibold text-warning" : "text-ink-muted"}`}>
                        {daysLabel(days)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-right text-xs text-ink-muted">
        {filtered.length} demande{filtered.length > 1 ? "s" : ""}
      </p>
    </div>
  );
}

/** Ligne de bandeau entièrement cliquable (motif ligne de liste). */
const rowLinkClasses =
  "flex min-h-11 items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2.5 transition-colors " +
  "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Ancienneté en jours, lisible (« 3 j »). */
function daysLabel(days: number): string {
  return `${days} j`;
}
