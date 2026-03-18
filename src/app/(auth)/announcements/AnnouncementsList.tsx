"use client";

import { useState } from "react";
import type { AnnouncementStatus, ServiceRequestType, ServiceRequestStatus } from "@prisma/client";

interface ChildRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  deliveryLink: string | null;
  reviewNotes: string | null;
  assignedDept: { id: string; name: string } | null;
}

interface ServiceRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  reviewNotes: string | null;
  assignedDept: { id: string; name: string } | null;
  childRequests: ChildRequest[];
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  channelInterne: boolean;
  channelExterne: boolean;
  isSaveTheDate: boolean;
  isUrgent: boolean;
  eventDate: Date | null;
  submittedAt: Date;
  department: { id: string; name: string } | null;
  ministry: { id: string; name: string } | null;
  targetEvents: { event: { id: string; title: string; date: Date } }[];
  serviceRequests: ServiceRequest[];
}

interface Props {
  announcements: Announcement[];
}

const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  TRAITEE: "Traitée",
  ANNULEE: "Annulée",
};

const STATUS_COLOR: Record<AnnouncementStatus, string> = {
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  EN_COURS: "bg-blue-100 text-blue-800",
  TRAITEE: "bg-green-100 text-green-800",
  ANNULEE: "bg-gray-100 text-gray-500",
};

const SR_TYPE_LABEL: Record<ServiceRequestType, string> = {
  DIFFUSION_INTERNE: "Diffusion interne",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  VISUEL: "Visuel",
};

const SR_STATUS_BADGE: Record<ServiceRequestStatus, string> = {
  EN_ATTENTE: "bg-amber-100 text-amber-800 border border-amber-200",
  EN_COURS:   "bg-blue-100 text-blue-800 border border-blue-200",
  LIVRE:      "bg-green-100 text-green-800 border border-green-200",
  ANNULE:     "bg-gray-100 text-gray-500 border border-gray-200",
};

const SR_STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS:   "En cours",
  LIVRE:      "Livré",
  ANNULE:     "Annulé",
};

const SR_STATUS_DOT: Record<ServiceRequestStatus, string> = {
  EN_ATTENTE: "●",
  EN_COURS:   "●",
  LIVRE:      "✓",
  ANNULE:     "✗",
};

export default function AnnouncementsList({ announcements: initial }: Props) {
  const [announcements, setAnnouncements] = useState(initial);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function cancelAnnouncement(id: string) {
    if (!confirm("Annuler cette demande ? Les demandes de service liées seront également annulées.")) return;
    setCancelling(id);
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ANNULEE" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }
      setAnnouncements((prev) =>
        prev.map((ann) => ann.id === id ? { ...ann, status: "ANNULEE" as AnnouncementStatus } : ann)
      );
    } catch {
      alert("Erreur");
    } finally {
      setCancelling(null);
    }
  }

  if (announcements.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">Aucune annonce soumise.</p>
        <p className="text-sm mt-1">Cliquez sur &quot;+ Nouvelle annonce&quot; pour commencer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {announcements.map((ann) => (
        <div key={ann.id} className="bg-white rounded-lg shadow p-5 border border-gray-100">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-gray-900">{ann.title}</h2>
                {ann.isSaveTheDate && (
                  <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full">
                    Save the Date
                  </span>
                )}
                {ann.isUrgent && (
                  <span className="text-xs bg-icc-rouge/10 text-icc-rouge px-2 py-0.5 rounded-full">
                    Urgent
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {ann.department?.name ?? ann.ministry?.name ?? "—"} ·{" "}
                {new Date(ann.submittedAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[ann.status]}`}>
                {STATUS_LABEL[ann.status]}
              </span>
              {(ann.status === "EN_ATTENTE" || ann.status === "EN_COURS") && (
                <button
                  onClick={() => cancelAnnouncement(ann.id)}
                  disabled={cancelling === ann.id}
                  className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-icc-rouge border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title="Annuler la demande"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-600 line-clamp-2 mb-3">{ann.content}</p>

          {ann.targetEvents.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {ann.targetEvents.map(({ event }) => (
                <span
                  key={event.id}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                >
                  {new Date(event.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              ))}
            </div>
          )}

          {ann.serviceRequests.length > 0 && (
            <div className="border-t border-gray-100 pt-3 mt-1 space-y-2">
              {ann.serviceRequests.map((sr) => (
                <div key={sr.id}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${SR_STATUS_BADGE[sr.status]}`}>
                      {SR_STATUS_DOT[sr.status]} {SR_STATUS_LABEL[sr.status]}
                    </span>
                    <span className="text-xs font-medium text-gray-700">
                      {SR_TYPE_LABEL[sr.type]}
                    </span>
                    {sr.assignedDept && (
                      <span className="text-xs text-gray-400">→ {sr.assignedDept.name}</span>
                    )}
                  </div>
                  {sr.status === "ANNULE" && sr.reviewNotes && (
                    <p className="mt-1 text-xs text-gray-500 italic pl-1">
                      Motif : {sr.reviewNotes}
                    </p>
                  )}
                  {sr.childRequests.map((child) => (
                    <div key={child.id} className="pl-4 mt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${SR_STATUS_BADGE[child.status]}`}>
                          {SR_STATUS_DOT[child.status]} {SR_STATUS_LABEL[child.status]}
                        </span>
                        <span className="text-xs text-gray-500">{SR_TYPE_LABEL[child.type]}</span>
                        {child.assignedDept && (
                          <span className="text-xs text-gray-400">→ {child.assignedDept.name}</span>
                        )}
                        {child.deliveryLink && child.status === "LIVRE" && (
                          <a
                            href={child.deliveryLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-icc-violet underline font-medium"
                          >
                            Voir le visuel →
                          </a>
                        )}
                      </div>
                      {child.status === "ANNULE" && child.reviewNotes && (
                        <p className="mt-1 text-xs text-gray-500 italic">
                          Motif : {child.reviewNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
