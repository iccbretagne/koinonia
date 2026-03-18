"use client";

import type { AnnouncementStatus, ServiceRequestType, ServiceRequestStatus } from "@prisma/client";

interface ChildRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  deliveryLink: string | null;
  assignedDept: { id: string; name: string } | null;
}

interface ServiceRequest {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
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

const SR_STATUS_ICON: Record<ServiceRequestStatus, string> = {
  EN_ATTENTE: "⏳",
  EN_COURS: "●",
  LIVRE: "✓",
  ANNULE: "✗",
};

const SR_STATUS_COLOR: Record<ServiceRequestStatus, string> = {
  EN_ATTENTE: "text-amber-600",
  EN_COURS: "text-blue-600",
  LIVRE: "text-green-600",
  ANNULE: "text-gray-400",
};

export default function AnnouncementsList({ announcements }: Props) {
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
            <span
              className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[ann.status]}`}
            >
              {STATUS_LABEL[ann.status]}
            </span>
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
            <div className="border-t border-gray-100 pt-3 mt-1 space-y-1.5">
              {ann.serviceRequests.map((sr) => (
                <div key={sr.id}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={SR_STATUS_COLOR[sr.status]}>
                      {SR_STATUS_ICON[sr.status]}
                    </span>
                    <span className="font-medium text-gray-700">
                      {SR_TYPE_LABEL[sr.type]}
                    </span>
                    {sr.assignedDept && (
                      <span className="text-gray-400">→ {sr.assignedDept.name}</span>
                    )}
                  </div>
                  {sr.childRequests.map((child) => (
                    <div key={child.id} className="flex items-center gap-2 text-xs pl-4 mt-0.5">
                      <span className={SR_STATUS_COLOR[child.status]}>
                        {SR_STATUS_ICON[child.status]}
                      </span>
                      <span className="text-gray-500">{SR_TYPE_LABEL[child.type]}</span>
                      {child.assignedDept && (
                        <span className="text-gray-400">→ {child.assignedDept.name}</span>
                      )}
                      {child.deliveryLink && child.status === "LIVRE" && (
                        <a
                          href={child.deliveryLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-icc-violet underline"
                        >
                          Voir le visuel
                        </a>
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
