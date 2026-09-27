"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

const DESTRUCTIVE_STATUSES = new Set(["REFUSEE", "ANNULE"]);

const ANNOUNCEMENT_TYPES = ["DIFFUSION_INTERNE", "RESEAUX_SOCIAUX", "VISUEL"];
const DEMAND_TYPES = [
  "AJOUT_EVENEMENT",
  "MODIFICATION_EVENEMENT",
  "ANNULATION_EVENEMENT",
  "MODIFICATION_PLANNING",
  "DEMANDE_ACCES",
];

const TYPE_LABEL: Record<string, string> = {
  VISUEL: "Visuel",
  DIFFUSION_INTERNE: "Diffusion interne",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  AJOUT_EVENEMENT: "Ajout événement",
  MODIFICATION_EVENEMENT: "Modif. événement",
  ANNULATION_EVENEMENT: "Annul. événement",
  MODIFICATION_PLANNING: "Modif. planning",
  DEMANDE_ACCES: "Demande d'accès",
};

const TYPE_ICON: Record<string, string> = {
  DIFFUSION_INTERNE: "📢",
  RESEAUX_SOCIAUX: "📣",
  VISUEL: "🎨",
  AJOUT_EVENEMENT: "📅",
  MODIFICATION_EVENEMENT: "✏️",
  ANNULATION_EVENEMENT: "❌",
  MODIFICATION_PLANNING: "📋",
  DEMANDE_ACCES: "🔑",
};

const STATUS_COLOR: Record<string, string> = {
  EN_ATTENTE: "bg-warning-soft text-warning",
  EN_COURS: "bg-info-soft text-info",
  APPROUVEE: "bg-success-soft text-success",
  EXECUTEE: "bg-success-soft text-success",
  LIVRE: "bg-success-soft text-success",
  REFUSEE: "bg-danger-soft text-danger",
  ANNULE: "bg-surface-sunken text-ink-muted",
  ERREUR: "bg-danger-soft text-danger",
};

const STATUS_LABEL: Record<string, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  APPROUVEE: "Approuvée",
  EXECUTEE: "Exécutée",
  LIVRE: "Diffusée",
  REFUSEE: "Refusée",
  ANNULE: "Annulé",
  ERREUR: "Erreur",
};

type FilterCategory = "all" | "announcements" | "demands";

interface RequestItem {
  id: string;
  type: string;
  status: string;
  title: string;
  payload: unknown;
  reviewNotes: string | null;
  executionError: string | null;
  submittedAt: Date;
  submittedBy: { name: string | null; displayName: string | null };
  department: { name: string } | null;
  ministry: { name: string } | null;
  announcement: {
    id: string;
    title: string;
    content: string;
    eventDate: Date | null;
    isSaveTheDate: boolean;
    isUrgent: boolean;
  } | null;
  childRequests: {
    id: string;
    type: string;
    status: string;
    payload: unknown;
  }[];
  reviewedBy: { name: string | null; displayName: string | null } | null;
}

interface Props {
  readonly requests: RequestItem[];
  readonly canManage?: boolean;
}

export default function RequestsDashboard({ requests: initial, canManage = false }: Props) {
  const [requests, setRequests] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<FilterCategory>("all");
  const [showProcessed, setShowProcessed] = useState(false);
  const [expandedContent, setExpandedContent] = useState<Set<string>>(new Set());

  const filtered = requests.filter((r) => {
    if (category === "announcements" && !ANNOUNCEMENT_TYPES.includes(r.type)) return false;
    if (category === "demands" && !DEMAND_TYPES.includes(r.type)) return false;
    return true;
  });

  const pending = filtered.filter((r) => r.status === "EN_ATTENTE");
  const processed = filtered.filter((r) => r.status !== "EN_ATTENTE");

  async function deleteRequest(id: string) {
    if (!confirm("Supprimer définitivement cette demande ?")) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      alert("Erreur");
    } finally {
      setProcessing(null);
    }
  }

  async function updateRequest(id: string, status: string, note?: string) {
    if (DESTRUCTIVE_STATUSES.has(status) && !confirm("Confirmer cette action ? Elle est définitive.")) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(note ? { reviewNotes: note } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }

      const result = await res.json();

      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: result.data?.status ?? status,
                reviewNotes: note ?? r.reviewNotes,
                executionError: result.data?.executionError ?? r.executionError,
              }
            : r
        )
      );
      setNotes((prev) => ({ ...prev, [id]: "" }));
    } catch {
      alert("Erreur");
    } finally {
      setProcessing(null);
    }
  }

  function renderPayloadSummary(req: RequestItem) {
    const p = ((req.payload ?? {}) as Record<string, unknown>);

    if (req.type === "AJOUT_EVENEMENT") {
      const deptIds = p.departmentIds as string[] | undefined;
      const deptCount = Array.isArray(deptIds) ? deptIds.length : 0;
      const recurrence = p.recurrenceRule as string | undefined;
      const recurrenceLabels: Record<string, string> = {
        weekly: "Hebdo",
        biweekly: "Bihebdo",
        monthly: "Mensuel",
      };
      const parts = [
        `${p.eventType ?? ""}`,
        p.eventDate ? new Date(p.eventDate as string).toLocaleDateString("fr-FR") : "",
        deptCount > 0 ? `${deptCount} département${deptCount !== 1 ? "s" : ""}` : null,
        recurrence ? `Récurrence : ${recurrenceLabels[recurrence] ?? recurrence}` : null,
      ].filter(Boolean);
      return parts.join(" — ");
    }
    if (req.type === "ANNULATION_EVENEMENT") {
      return `Raison : ${p.reason ?? "—"}`;
    }
    if (req.type === "MODIFICATION_PLANNING") {
      const deptIds = p.departmentIds as string[] | undefined;
      const count = Array.isArray(deptIds) ? deptIds.length : 0;
      return `${count} département${count !== 1 ? "s" : ""} sélectionné${count !== 1 ? "s" : ""}`;
    }
    if (req.type === "DEMANDE_ACCES") {
      return `Rôle : ${p.role ?? "—"}`;
    }
    return null;
  }

  function renderRequest(req: RequestItem) {
    const author = req.submittedBy.displayName ?? req.submittedBy.name ?? "—";
    const source = req.department?.name ?? req.ministry?.name ?? null;
    const isDemand = DEMAND_TYPES.includes(req.type);
    const payloadSummary = renderPayloadSummary(req);

    return (
      <div key={req.id} className="bg-surface rounded-lg shadow p-5 border border-line">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">{TYPE_ICON[req.type] ?? "📄"}</span>
              <span className="text-xs font-medium text-ink-muted uppercase">
                {TYPE_LABEL[req.type] ?? req.type}
              </span>
              {req.announcement?.isSaveTheDate && (
                <span className="text-xs bg-brand-soft text-brand-text px-2 py-0.5 rounded-full">
                  Save the Date
                </span>
              )}
              {req.announcement?.isUrgent && (
                <span className="text-xs bg-danger-soft text-danger px-2 py-0.5 rounded-full">
                  Urgent
                </span>
              )}
            </div>
            <h3 className="font-semibold text-ink mt-1">
              {req.announcement ? req.announcement.title : req.title}
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              par {author}
              {source && <> · {source}</>}
              {" · "}
              {new Date(req.submittedAt).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
              })}
            </p>
          </div>
          <span
            className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
              STATUS_COLOR[req.status] ?? "bg-surface-sunken text-ink-muted"
            }`}
          >
            {STATUS_LABEL[req.status] ?? req.status}
          </span>
        </div>

        {/* Announcement content */}
        {req.announcement?.content && (() => {
          const content = req.announcement.content;
          const PREVIEW = 150;
          const isLong = content.length > PREVIEW;
          const isExpanded = expandedContent.has(req.id);
          return (
            <div className="mb-3">
              <p className="text-sm text-ink-muted whitespace-pre-wrap">
                {isLong && !isExpanded ? `${content.slice(0, PREVIEW).trimEnd()}…` : content}
              </p>
              {isLong && (
                <button
                  onClick={() => setExpandedContent((prev) => {
                    const next = new Set(prev);
                    if (isExpanded) next.delete(req.id); else next.add(req.id);
                    return next;
                  })}
                  className="mt-1 text-xs text-brand-text hover:underline"
                >
                  {isExpanded ? "Voir moins" : "Voir plus"}
                </button>
              )}
            </div>
          );
        })()}

        {/* Demand payload summary */}
        {isDemand && payloadSummary && (
          <p className="text-sm text-ink-muted mb-3">{payloadSummary}</p>
        )}

        {/* Child request statuses */}
        {req.childRequests.length > 0 && (
          <div className="mb-3 space-y-1">
            {req.childRequests.map((child) => (
              <div key={child.id} className="flex items-center gap-2 text-xs text-ink-muted">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    child.status === "EN_ATTENTE"
                      ? "bg-warning"
                      : child.status === "EN_COURS"
                        ? "bg-info"
                        : child.status === "LIVRE"
                          ? "bg-success"
                          : "bg-control-line"
                  }`}
                />
                <span>{TYPE_LABEL[child.type] ?? child.type}</span>
                <span className="text-ink-subtle">{STATUS_LABEL[child.status] ?? child.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Execution error */}
        {req.status === "ERREUR" && req.executionError && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-lg mb-3">
            Erreur : {req.executionError}
          </p>
        )}

        {/* Review notes */}
        {req.reviewNotes && req.status !== "EN_ATTENTE" && (
          <p className="text-xs text-ink-muted italic mb-3">Note : {req.reviewNotes}</p>
        )}

        {/* Delete button for managers on processed requests */}
        {canManage && req.status !== "EN_ATTENTE" && (
          <div className="border-t border-line pt-3 flex justify-end">
            <Button
              size="sm"
              variant="danger"
              onClick={() => deleteRequest(req.id)}
              disabled={processing === req.id}
            >
              Supprimer
            </Button>
          </div>
        )}

        {/* Actions for pending requests */}
        {req.status === "EN_ATTENTE" && (
          <div className="border-t border-line pt-3 space-y-3">
            <textarea
              value={notes[req.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
              placeholder={isDemand ? "Note (optionnelle pour approbation, obligatoire pour refus)" : "Note (optionnelle)"}
              rows={2}
              className="block w-full px-3 py-2 border border-line rounded-lg text-xs focus:outline-none focus:border-brand"
            />
            <div className="flex flex-wrap gap-2">
              {isDemand ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => updateRequest(req.id, "APPROUVEE", notes[req.id])}
                    disabled={processing === req.id}
                  >
                    ✓ Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (!notes[req.id]) {
                        alert("Une note est requise pour refuser une demande.");
                        return;
                      }
                      updateRequest(req.id, "REFUSEE", notes[req.id]);
                    }}
                    disabled={processing === req.id}
                  >
                    ✗ Refuser
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={() => updateRequest(req.id, "LIVRE", notes[req.id])}
                    disabled={processing === req.id}
                  >
                    ✓ Diffusée
                  </Button>
                  <Button
                    size="sm"
                    variant="info"
                    onClick={() => updateRequest(req.id, "EN_COURS", notes[req.id])}
                    disabled={processing === req.id}
                  >
                    En cours
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => updateRequest(req.id, "ANNULE", notes[req.id])}
                    disabled={processing === req.id}
                  >
                    Annuler
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex rounded-lg border border-line overflow-hidden text-sm">
          {(["all", "announcements", "demands"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                category === cat
                  ? "bg-brand text-on-brand"
                  : "text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              {cat === "all" ? "Tout" : cat === "announcements" ? "Annonces" : "Demandes"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-line overflow-hidden text-sm">
          <button
            onClick={() => setShowProcessed(false)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              !showProcessed ? "bg-brand text-on-brand" : "text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            En attente ({pending.length})
          </button>
          <button
            onClick={() => setShowProcessed(true)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              showProcessed ? "bg-brand text-on-brand" : "text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            Traitées
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {(showProcessed ? processed : pending).map(renderRequest)}
      </div>

      {(showProcessed ? processed : pending).length === 0 && (
        <div className="text-center py-12 text-ink-subtle">
          <p className="text-lg">
            {showProcessed ? "Aucune demande traitée." : "Aucune demande en attente."}
          </p>
        </div>
      )}
    </div>
  );
}
