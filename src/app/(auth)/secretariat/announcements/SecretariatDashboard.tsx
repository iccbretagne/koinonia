"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { AnnouncementStatus, ServiceRequestStatus, ServiceRequestType } from "@prisma/client";

interface ChildRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  deliveryLink: string | null;
}

interface ServiceRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  reviewNotes: string | null;
  childRequests: ChildRequest[];
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  isUrgent: boolean;
  isSaveTheDate: boolean;
  eventDate: Date | null;
  submittedAt: Date;
  submittedBy: { name: string | null; displayName: string | null };
  department: { name: string } | null;
  ministry: { name: string } | null;
  targetEvents: { event: { id: string; title: string; date: Date } }[];
  serviceRequests: ServiceRequest[];
}

interface Props {
  announcements: Announcement[];
}

const STATUS_COLOR: Record<ServiceRequestStatus, string> = {
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  EN_COURS: "bg-blue-100 text-blue-800",
  LIVRE: "bg-green-100 text-green-800",
  ANNULE: "bg-gray-100 text-gray-500",
};

function isLate(submittedAt: Date): boolean {
  const d = new Date(submittedAt);
  const day = d.getDay();
  const hour = d.getHours();
  return day > 2 || (day === 2 && hour >= 24);
}

export default function SecretariatDashboard({ announcements: initial }: Props) {
  const [announcements, setAnnouncements] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function updateRequest(srId: string, status: ServiceRequestStatus, note?: string) {
    setProcessing(srId);
    try {
      const res = await fetch(`/api/service-requests/${srId}`, {
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

      setAnnouncements((prev) =>
        prev.map((ann) => ({
          ...ann,
          serviceRequests: ann.serviceRequests.map((sr) =>
            sr.id === srId ? { ...sr, status, reviewNotes: note ?? sr.reviewNotes } : sr
          ),
        }))
      );
      setNotes((prev) => ({ ...prev, [srId]: "" }));
    } catch {
      alert("Erreur");
    } finally {
      setProcessing(null);
    }
  }

  const pending = announcements.filter((a) =>
    a.serviceRequests.some((sr) => sr.type === "DIFFUSION_INTERNE" && sr.status === "EN_ATTENTE")
  );
  const rest = announcements.filter((a) =>
    !a.serviceRequests.some((sr) => sr.type === "DIFFUSION_INTERNE" && sr.status === "EN_ATTENTE")
  );

  function renderAnnouncement(ann: Announcement) {
    const diffusion = ann.serviceRequests.find((sr) => sr.type === "DIFFUSION_INTERNE");
    if (!diffusion) return null;

    const late = isLate(ann.submittedAt) && !ann.isUrgent;
    const source = ann.department?.name ?? ann.ministry?.name ?? "—";
    const author = ann.submittedBy.displayName ?? ann.submittedBy.name ?? "—";

    return (
      <div
        key={ann.id}
        className="bg-white rounded-lg shadow p-5 border border-gray-100"
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{ann.title}</h3>
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
              {late && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  Hors délai
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {source} · {author} ·{" "}
              {new Date(ann.submittedAt).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[diffusion.status]}`}>
            {diffusion.status === "EN_ATTENTE"
              ? "En attente"
              : diffusion.status === "EN_COURS"
              ? "En cours"
              : diffusion.status === "LIVRE"
              ? "Diffusée"
              : "Annulée"}
          </span>
        </div>

        <p className="text-sm text-gray-700 mt-2 mb-3 whitespace-pre-wrap">{ann.content}</p>

        {ann.eventDate && (
          <p className="text-xs text-gray-500 mb-2">
            📅 Événement :{" "}
            {new Date(ann.eventDate).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}

        {ann.targetEvents.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {ann.targetEvents.map(({ event }) => (
              <span key={event.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {new Date(event.date).toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            ))}
          </div>
        )}

        {diffusion.status === "EN_ATTENTE" && (
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <textarea
              value={notes[diffusion.id] ?? ""}
              onChange={(e) =>
                setNotes((prev) => ({ ...prev, [diffusion.id]: e.target.value }))
              }
              placeholder="Note (optionnelle pour validation, obligatoire pour refus)"
              rows={2}
              className="block w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-xs focus:outline-none focus:border-icc-violet"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => updateRequest(diffusion.id, "LIVRE", notes[diffusion.id])}
                disabled={processing === diffusion.id}
              >
                ✓ Valider
              </Button>
              <Button
                size="sm"
                variant="info"
                onClick={() => updateRequest(diffusion.id, "EN_COURS", notes[diffusion.id])}
                disabled={processing === diffusion.id}
              >
                En cours
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (!notes[diffusion.id]) {
                    alert("Une note est requise pour refuser une annonce.");
                    return;
                  }
                  updateRequest(diffusion.id, "ANNULE", notes[diffusion.id]);
                }}
                disabled={processing === diffusion.id}
              >
                ✗ Refuser
              </Button>
            </div>
          </div>
        )}

        {diffusion.reviewNotes && (
          <p className="mt-2 text-xs text-gray-500 italic">Note : {diffusion.reviewNotes}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            En attente
            <span className="bg-icc-violet text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-4">{pending.map(renderAnnouncement)}</div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Traitées</h2>
          <div className="space-y-4">{rest.map(renderAnnouncement)}</div>
        </section>
      )}

      {announcements.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Aucune demande de diffusion interne.</p>
        </div>
      )}
    </div>
  );
}
