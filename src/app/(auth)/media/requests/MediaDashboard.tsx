"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface ParentRequest {
  id: string;
  type: string;
  status: string;
}

interface MediaRequest {
  id: string;
  type: string;
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
    eventDate: Date | null;
    isSaveTheDate: boolean;
  } | null;
  parentRequest: ParentRequest | null;
}

interface Props {
  requests: MediaRequest[];
}

const STATUS_LABEL: Record<string, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  LIVRE: "Livré",
  ANNULE: "Annulé",
};

const STATUS_COLOR: Record<string, string> = {
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  EN_COURS: "bg-blue-100 text-blue-800",
  LIVRE: "bg-green-100 text-green-800",
  ANNULE: "bg-gray-100 text-gray-500",
};

const PARENT_TYPE_LABEL: Record<string, string> = {
  DIFFUSION_INTERNE: "Diffusion interne",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  VISUEL: "Visuel",
};

export default function MediaDashboard({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [deliveryLinks, setDeliveryLinks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function updateRequest(
    id: string,
    status: string,
    deliveryLink?: string,
    reviewNotes?: string
  ) {
    setProcessing(id);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(deliveryLink !== undefined ? { deliveryLink } : {}),
          ...(reviewNotes ? { reviewNotes } : {}),
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
          return { ...r, status, payload: updatedPayload, reviewNotes: reviewNotes ?? r.reviewNotes };
        })
      );
      setDeliveryLinks((prev) => ({ ...prev, [id]: "" }));
      setNotes((prev) => ({ ...prev, [id]: "" }));
    } catch {
      alert("Erreur");
    } finally {
      setProcessing(null);
    }
  }

  const pending = requests.filter((r) => r.status === "EN_ATTENTE");
  const inProgress = requests.filter((r) => r.status === "EN_COURS");
  const done = requests.filter((r) => r.status === "LIVRE" || r.status === "ANNULE");

  function renderRequest(req: MediaRequest) {
    const source = req.department?.name ?? req.ministry?.name ?? "—";
    const author = req.submittedBy.displayName ?? req.submittedBy.name ?? "—";
    const p = (req.payload ?? {}) as Record<string, unknown>;
    const brief = (p.brief as string) ?? null;
    const format = (p.format as string) ?? null;
    const deadline = (p.deadline as string) ?? null;
    const deliveryLink = (p.deliveryLink as string) ?? null;

    return (
      <div key={req.id} className="bg-white rounded-lg shadow p-5 border border-gray-100">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{req.title}</h3>
              {format && (
                <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full">
                  {format}
                </span>
              )}
              {!req.announcement && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  Standalone
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {source} · {author}
              {deadline && (
                <>
                  {" "}· Deadline{" "}
                  <strong>
                    {new Date(deadline).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </strong>
                </>
              )}
            </p>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[req.status]}`}>
            {STATUS_LABEL[req.status]}
          </span>
        </div>

        {req.announcement && (
          <p className="text-xs text-gray-500 mb-2">
            {req.parentRequest ? (
              <>Pour canal : <strong>{PARENT_TYPE_LABEL[req.parentRequest.type]}</strong></>
            ) : null}
            {req.announcement.isSaveTheDate && " · Save the Date"}
            {req.announcement.eventDate && (
              <> · Événement le {new Date(req.announcement.eventDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}</>
            )}
          </p>
        )}

        {brief && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">{brief}</p>
        )}

        {deliveryLink && req.status === "LIVRE" && (
          <a
            href={deliveryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-icc-violet underline mb-3"
          >
            Voir le visuel livré →
          </a>
        )}

        {(req.status === "EN_ATTENTE" || req.status === "EN_COURS") && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {req.status === "EN_COURS" && (
              <input
                type="url"
                value={deliveryLinks[req.id] ?? ""}
                onChange={(e) => setDeliveryLinks((prev) => ({ ...prev, [req.id]: e.target.value }))}
                placeholder="Lien de livraison (Canva, Drive...)"
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
                  ✓ Marquer livré
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                onClick={() => updateRequest(req.id, "ANNULE", undefined, notes[req.id])}
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
          <p className="text-lg">Aucune demande de visuel.</p>
        </div>
      )}
    </div>
  );
}
