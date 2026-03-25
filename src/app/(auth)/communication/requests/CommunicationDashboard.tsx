"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface ChildRequest {
  id: string;
  type: string;
  status: string;
  payload: unknown;
}

interface CommRequest {
  id: string;
  status: string;
  title: string;
  payload: unknown;
  reviewNotes: string | null;
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
  } | null;
  childRequests: ChildRequest[];
}

interface Props {
  requests: CommRequest[];
}

const STATUS_COLOR: Record<string, string> = {
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  EN_COURS: "bg-blue-100 text-blue-800",
  LIVRE: "bg-green-100 text-green-800",
  ANNULE: "bg-gray-100 text-gray-500",
};

const VISUEL_STATUS_INFO: Record<string, { icon: string; label: string; color: string }> = {
  EN_ATTENTE: { icon: "⏳", label: "Visuel en attente", color: "text-amber-600" },
  EN_COURS: { icon: "●", label: "Visuel en cours de création", color: "text-blue-600" },
  LIVRE: { icon: "✓", label: "Visuel livré", color: "text-green-600" },
  ANNULE: { icon: "✗", label: "Visuel annulé", color: "text-gray-400" },
};

export default function CommunicationDashboard({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [deliveryLinks, setDeliveryLinks] = useState<Record<string, string>>({});

  async function updateRequest(id: string, status: string, deliveryLink?: string) {
    setProcessing(id);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(deliveryLink !== undefined ? { deliveryLink } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updatedPayload = { ...((r.payload ?? {}) as Record<string, unknown>) };
          if (deliveryLink !== undefined) updatedPayload.deliveryLink = deliveryLink;
          return { ...r, status, payload: updatedPayload };
        })
      );
      setDeliveryLinks((prev) => ({ ...prev, [id]: "" }));
    } catch {
      alert("Erreur");
    } finally {
      setProcessing(null);
    }
  }

  const pending = requests.filter((r) => r.status === "EN_ATTENTE");
  const inProgress = requests.filter((r) => r.status === "EN_COURS");
  const done = requests.filter((r) => r.status === "LIVRE" || r.status === "ANNULE");

  function renderRequest(req: CommRequest) {
    const source = req.department?.name ?? req.ministry?.name ?? "—";
    const author = req.submittedBy.displayName ?? req.submittedBy.name ?? "—";
    const p = (req.payload ?? {}) as Record<string, unknown>;
    const deliveryLink = (p.deliveryLink as string) ?? null;
    const visuel = req.childRequests.find((c) => c.type === "VISUEL");
    const visuelInfo = visuel ? VISUEL_STATUS_INFO[visuel.status] : null;
    const vp = (visuel?.payload ?? {}) as Record<string, unknown>;
    const visuelDeliveryLink = (vp.deliveryLink as string) ?? null;

    return (
      <div key={req.id} className="bg-white rounded-lg shadow p-5 border border-gray-100">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{req.title}</h3>
              {req.announcement?.isSaveTheDate && (
                <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full">
                  Save the Date
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {source} · {author}
              {req.announcement?.eventDate && (
                <> · {new Date(req.announcement.eventDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}</>
              )}
            </p>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[req.status]}`}>
            {req.status === "EN_ATTENTE" ? "En attente" : req.status === "EN_COURS" ? "En cours" : req.status === "LIVRE" ? "Publié" : "Annulé"}
          </span>
        </div>

        {req.announcement && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">{req.announcement.content}</p>
        )}

        {visuelInfo && (
          <div className={`flex items-center gap-2 text-xs mb-3 ${visuelInfo.color}`}>
            <span>{visuelInfo.icon}</span>
            <span>{visuelInfo.label}</span>
            {visuel?.status === "LIVRE" && visuelDeliveryLink && (
              <a
                href={visuelDeliveryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Voir →
              </a>
            )}
          </div>
        )}

        {deliveryLink && req.status === "LIVRE" && (
          <a
            href={deliveryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-icc-violet underline mb-3"
          >
            Voir le post publié →
          </a>
        )}

        {(req.status === "EN_ATTENTE" || req.status === "EN_COURS") && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {req.status === "EN_COURS" && (
              <input
                type="url"
                value={deliveryLinks[req.id] ?? ""}
                onChange={(e) => setDeliveryLinks((prev) => ({ ...prev, [req.id]: e.target.value }))}
                placeholder="Lien du post publié (optionnel)"
                className="block w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-xs focus:outline-none focus:border-icc-violet"
              />
            )}
            <div className="flex flex-wrap gap-2">
              {req.status === "EN_ATTENTE" && (
                <Button
                  size="sm"
                  variant="info"
                  onClick={() => updateRequest(req.id, "EN_COURS")}
                  disabled={processing === req.id}
                >
                  Prendre en charge
                </Button>
              )}
              {req.status === "EN_COURS" && (
                <Button
                  size="sm"
                  onClick={() => updateRequest(req.id, "LIVRE", deliveryLinks[req.id] || undefined)}
                  disabled={processing === req.id}
                >
                  ✓ Marquer publié
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                onClick={() => updateRequest(req.id, "ANNULE")}
                disabled={processing === req.id}
              >
                Annuler
              </Button>
            </div>
          </div>
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
          <div className="space-y-4">{pending.map(renderRequest)}</div>
        </section>
      )}
      {inProgress.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">En cours</h2>
          <div className="space-y-4">{inProgress.map(renderRequest)}</div>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Terminés</h2>
          <div className="space-y-4">{done.map(renderRequest)}</div>
        </section>
      )}
      {requests.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Aucune demande réseaux sociaux.</p>
        </div>
      )}
    </div>
  );
}
