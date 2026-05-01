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
  churchId: string;
  mediaProjects: { id: string; name: string }[];
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

function isUrgent(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline + "T23:59:59").getTime() < Date.now() + 48 * 60 * 60 * 1000;
}

function sortUrgentFirst(list: MediaRequest[]): MediaRequest[] {
  return [...list].sort((a, b) => {
    const pa = (a.payload ?? {}) as Record<string, unknown>;
    const pb = (b.payload ?? {}) as Record<string, unknown>;
    const ua = isUrgent((pa.deadline as string) ?? null);
    const ub = isUrgent((pb.deadline as string) ?? null);
    if (ua === ub) return 0;
    return ua ? -1 : 1;
  });
}

export default function MediaDashboard({ requests: initial, churchId, mediaProjects: initialProjects }: Props) {
  const [requests, setRequests] = useState(initial);
  const [projects, setProjects] = useState(initialProjects);
  const [processing, setProcessing] = useState<string | null>(null);
  const [deliveryLinks, setDeliveryLinks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  // "Prendre en charge" inline form state
  const [takingCharge, setTakingCharge] = useState<string | null>(null);
  const [projectMode, setProjectMode] = useState<"existing" | "new">("existing");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [taking, setTaking] = useState(false);

  function openTakeCharge(reqId: string) {
    setTakingCharge(reqId);
    const mode = projects.length > 0 ? "existing" : "new";
    setProjectMode(mode);
    setSelectedProjectId(projects[0]?.id ?? "");
    setNewProjectName("");
  }

  async function handleTakeCharge(reqId: string) {
    setTaking(true);
    try {
      let projectId = selectedProjectId;

      if (projectMode === "new") {
        if (!newProjectName.trim()) { alert("Nom du projet requis"); return; }
        const res = await fetch("/api/media-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newProjectName.trim(), churchId }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur création projet"); return; }
        const created = await res.json();
        projectId = created.data.id;
        setProjects((prev) => [{ id: projectId, name: newProjectName.trim() }, ...prev]);
      }

      const patchRes = await fetch(`/api/requests/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "EN_COURS", payload: { mediaProjectId: projectId } }),
      });
      if (!patchRes.ok) { const d = await patchRes.json(); alert(d.error || "Erreur"); return; }

      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== reqId) return r;
          const updated = { ...(r.payload ?? {}) as Record<string, unknown>, mediaProjectId: projectId };
          return { ...r, status: "EN_COURS", payload: updated };
        })
      );
      setTakingCharge(null);
    } catch {
      alert("Erreur");
    } finally {
      setTaking(false);
    }
  }

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

  const pending = sortUrgentFirst(requests.filter((r) => r.status === "EN_ATTENTE"));
  const inProgress = sortUrgentFirst(requests.filter((r) => r.status === "EN_COURS"));
  const done = requests.filter((r) => r.status === "LIVRE" || r.status === "ANNULE");

  function renderRequest(req: MediaRequest) {
    const source = req.department?.name ?? req.ministry?.name ?? "—";
    const author = req.submittedBy.displayName ?? req.submittedBy.name ?? "—";
    const p = (req.payload ?? {}) as Record<string, unknown>;
    const brief = (p.brief as string) ?? null;
    const format = (p.format as string) ?? null;
    const deadline = (p.deadline as string) ?? null;
    const deliveryLink = (p.deliveryLink as string) ?? null;
    const mediaProjectId = (p.mediaProjectId as string) ?? null;
    const linkedProject = mediaProjectId ? projects.find((pr) => pr.id === mediaProjectId) : null;
    const urgent = isUrgent(deadline);

    return (
      <div key={req.id} className={`bg-white rounded-lg shadow p-5 border ${urgent && req.status !== "LIVRE" && req.status !== "ANNULE" ? "border-icc-rouge/40" : "border-gray-100"}`}>
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{req.title}</h3>
              {urgent && req.status !== "LIVRE" && req.status !== "ANNULE" && (
                <span className="text-xs font-semibold bg-icc-rouge text-white px-2 py-0.5 rounded-full">
                  ⚡ Urgent
                </span>
              )}
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

        {linkedProject && req.status === "EN_COURS" && (
          <a
            href={`/media/projects/${linkedProject.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-icc-violet hover:underline mb-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            {linkedProject.name}
          </a>
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
            {req.status === "EN_ATTENTE" && takingCharge === req.id ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Lier à un projet média</p>
                <div className="flex gap-4 text-sm">
                  {projects.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={projectMode === "existing"} onChange={() => setProjectMode("existing")} />
                      Projet existant
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={projectMode === "new"} onChange={() => setProjectMode("new")} />
                    Nouveau projet
                  </label>
                </div>
                {projectMode === "existing" && projects.length > 0 && (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="block w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                  >
                    {projects.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                )}
                {projectMode === "new" && (
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Nom du projet"
                    className="block w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                    autoFocus
                  />
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleTakeCharge(req.id)} disabled={taking}>
                    Confirmer
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setTakingCharge(null)} disabled={taking}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <>
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
                      onClick={() => openTakeCharge(req.id)}
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
              </>
            )}
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
