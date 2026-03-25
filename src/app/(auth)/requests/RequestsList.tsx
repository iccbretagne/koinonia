"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

const ANNOUNCEMENT_TYPES = ["VISUEL", "DIFFUSION_INTERNE", "RESEAUX_SOCIAUX"];

const TYPE_LABEL: Record<string, string> = {
  VISUEL: "Visuel",
  DIFFUSION_INTERNE: "Diffusion interne",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  AJOUT_EVENEMENT: "Ajout événement",
  MODIFICATION_EVENEMENT: "Modification événement",
  ANNULATION_EVENEMENT: "Annulation événement",
  MODIFICATION_PLANNING: "Modification planning",
  DEMANDE_ACCES: "Demande d'accès",
};

const TYPE_ICON: Record<string, string> = {
  VISUEL: "🎨",
  DIFFUSION_INTERNE: "📢",
  RESEAUX_SOCIAUX: "📣",
  AJOUT_EVENEMENT: "📅",
  MODIFICATION_EVENEMENT: "✏️",
  ANNULATION_EVENEMENT: "❌",
  MODIFICATION_PLANNING: "📋",
  DEMANDE_ACCES: "🔑",
};

const STATUS_LABEL: Record<string, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  APPROUVEE: "Approuvée",
  EXECUTEE: "Exécutée",
  LIVRE: "Livré",
  REFUSEE: "Refusée",
  ANNULE: "Annulé",
  ERREUR: "Erreur",
};

const STATUS_COLOR: Record<string, string> = {
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  EN_COURS: "bg-blue-100 text-blue-800",
  APPROUVEE: "bg-green-100 text-green-800",
  EXECUTEE: "bg-green-100 text-green-800",
  LIVRE: "bg-green-100 text-green-800",
  REFUSEE: "bg-red-100 text-red-700",
  ANNULE: "bg-gray-100 text-gray-500",
  ERREUR: "bg-red-100 text-red-700",
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
  department: { id: string; name: string } | null;
  ministry: { id: string; name: string } | null;
  assignedDept: { id: string; name: string } | null;
  announcement: {
    id: string;
    title: string;
    status: string;
    eventDate: Date | null;
    isSaveTheDate: boolean;
  } | null;
  childRequests: {
    id: string;
    type: string;
    status: string;
    payload: unknown;
    assignedDept: { id: string; name: string } | null;
  }[];
  reviewedBy: { id: string; name: string | null; displayName: string | null } | null;
}

interface Props {
  requests: RequestItem[];
}

function RequestCard({ req, onUpdated }: { req: RequestItem; onUpdated: (updated: Partial<RequestItem>) => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const source = req.department?.name ?? req.ministry?.name ?? null;
  const isPending = req.status === "EN_ATTENTE";

  async function handleCancel() {
    if (!confirm("Annuler définitivement cette demande ?")) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ANNULE" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Erreur lors de l'annulation");
      }
      onUpdated({ status: "ANNULE" });
    } catch (e) {
      setCancelling(false);
      setCancelError((e as Error).message);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 border border-gray-100">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">{TYPE_ICON[req.type] ?? "📄"}</span>
            <span className="text-xs font-medium text-gray-500 uppercase">
              {TYPE_LABEL[req.type] ?? req.type}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mt-1">
            {req.announcement ? req.announcement.title : req.title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {source && <>{source} · </>}
            {req.assignedDept && <>→ {req.assignedDept.name} · </>}
            {new Date(req.submittedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
            STATUS_COLOR[req.status] ?? "bg-gray-100 text-gray-500"
          }`}
        >
          {STATUS_LABEL[req.status] ?? req.status}
        </span>
      </div>

      {/* Child requests (visuals under announcements) */}
      {req.childRequests.length > 0 && (
        <div className="mt-2 space-y-1">
          {req.childRequests.map((child) => (
            <div key={child.id} className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  child.status === "EN_ATTENTE"
                    ? "bg-amber-400"
                    : child.status === "EN_COURS"
                      ? "bg-blue-400"
                      : child.status === "LIVRE"
                        ? "bg-green-400"
                        : "bg-gray-300"
                }`}
              />
              <span>{TYPE_LABEL[child.type] ?? child.type}</span>
              {child.assignedDept && (
                <span className="text-gray-400">→ {child.assignedDept.name}</span>
              )}
              <span className="text-gray-400">{STATUS_LABEL[child.status] ?? child.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Review notes for refused/error */}
      {(req.status === "REFUSEE" || req.status === "ERREUR") && req.reviewNotes && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          Note : {req.reviewNotes}
        </p>
      )}
      {req.status === "ERREUR" && req.executionError && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          Erreur : {req.executionError}
        </p>
      )}

      {/* Owner actions for pending requests */}
      {isPending && (
        <div className="mt-3 flex gap-2">
          <Link href={`/requests/${req.id}/edit`}>
            <Button variant="secondary" size="sm">
              Modifier
            </Button>
          </Link>
          <Button variant="danger" size="sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Annulation…" : "Annuler la demande"}
          </Button>
        </div>
      )}

      {cancelError && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{cancelError}</p>
      )}
    </div>
  );
}

export default function RequestsList({ requests }: Props) {
  const [items, setItems] = useState<RequestItem[]>(requests);
  const [category, setCategory] = useState<FilterCategory>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  function handleUpdated(id: string, patch: Partial<RequestItem>) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const filtered = items.filter((r) => {
    if (category === "announcements" && !ANNOUNCEMENT_TYPES.includes(r.type)) return false;
    if (category === "demands" && ANNOUNCEMENT_TYPES.includes(r.type)) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const statuses = Array.from(new Set(items.map((r) => r.status)));

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">Aucune demande soumise.</p>
        <p className="text-sm mt-1">Cliquez sur &quot;+ Nouvelle demande&quot; pour commencer.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm">
          {(["all", "announcements", "demands"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                category === cat
                  ? "bg-icc-violet text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat === "all" ? "Tout" : cat === "announcements" ? "Annonces" : "Demandes"}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border-2 border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-icc-violet"
        >
          <option value="all">Tous statuts</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {filtered.map((req) => (
          <RequestCard
            key={req.id}
            req={req}
            onUpdated={(patch) => handleUpdated(req.id, patch)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>Aucune demande ne correspond aux filtres.</p>
        </div>
      )}
    </div>
  );
}
