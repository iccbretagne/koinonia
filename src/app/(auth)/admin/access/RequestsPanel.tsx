"use client";

import { useState } from "react";
import Image from "next/image";
import { ROLE_LABELS as ROLE_LABELS_BASE } from "@/lib/roles";

// DEPUTY n'est pas un rôle d'église (Role) — c'est un attribut (isDeputy) d'un DEPARTMENT_HEAD —
// d'où ce libellé propre, les autres venant de la source unique `@/lib/roles` (spec 054).
const REQUESTED_ROLE_LABELS: Record<string, string> = {
  DEPARTMENT_HEAD: ROLE_LABELS_BASE.DEPARTMENT_HEAD,
  DEPUTY: "Adjoint de département",
  MINISTER: ROLE_LABELS_BASE.MINISTER,
  DISCIPLE_MAKER: ROLE_LABELS_BASE.DISCIPLE_MAKER,
  REPORTER: ROLE_LABELS_BASE.REPORTER,
};

interface PendingRequest {
  id: string;
  user: { name: string; email: string; image: string | null };
  member: { id: string; firstName: string; lastName: string; deptName: string | null; ministryName: string | null } | null;
  firstName: string | null;
  lastName: string | null;
  department: { id: string; name: string; ministryName: string } | null;
  ministry: { id: string; name: string } | null;
  requestedRole: string | null;
  notes: string | null;
  createdAt: string;
}

interface RejectedRequest {
  id: string;
  user: { name: string; email: string };
  member: { firstName: string; lastName: string } | null;
  firstName: string | null;
  lastName: string | null;
  requestedRole: string | null;
  rejectReason: string | null;
  reviewedAt: string | null;
}

interface Ministry {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
}

interface Props {
  readonly pendingRequests: PendingRequest[];
  readonly rejectedRequests: RejectedRequest[];
  readonly ministries: Ministry[];
  readonly onCountChange?: (count: number) => void;
}

function Avatar({ user, size = 32 }: { readonly user: { name: string; image: string | null }; readonly size?: number }) {
  if (user.image) {
    return <Image src={user.image} alt={user.name} width={size} height={size} className="rounded-full shrink-0" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 shrink-0"
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function RequestsPanel({ pendingRequests, rejectedRequests, ministries }: Props) {
  const [localRequests, setLocalRequests] = useState<PendingRequest[]>(pendingRequests);
  const [rejected, setRejected] = useState<RejectedRequest[]>(rejectedRequests);
  const [showRejected, setShowRejected] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reconsidering, setReconsidering] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<PendingRequest | null>(null);
  const [approveModalDeptId, setApproveModalDeptId] = useState("");

  function openApproveModal(req: PendingRequest) {
    const allDepts = ministries.flatMap((m) => m.departments);
    const defaultDeptId = req.department?.id ?? allDepts[0]?.id ?? "";
    setApproveModalDeptId(defaultDeptId);
    setApproveModal(req);
  }

  async function confirmApprove() {
    if (!approveModal) return;
    setApprovingId(approveModal.id);
    try {
      const role = approveModal.requestedRole;
      const needsDept = role === "DEPARTMENT_HEAD" || role === "DEPUTY";
      const res = await fetch(`/api/member-link-requests/${approveModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          ...(needsDept && approveModalDeptId ? { departmentId: approveModalDeptId } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Erreur lors de l'approbation");
        return;
      }
      setLocalRequests((prev) => prev.filter((r) => r.id !== approveModal.id));
      setApproveModal(null);
    } finally {
      setApprovingId(null);
    }
  }

  async function reconsider(req: RejectedRequest) {
    setReconsidering(req.id);
    try {
      const res = await fetch(`/api/member-link-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconsider" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRejected((prev) => prev.filter((r) => r.id !== req.id));
      setLocalRequests((prev) => [
        ...prev,
        {
          id: req.id,
          user: { name: req.user.name, email: req.user.email, image: null },
          member: req.member ? { id: "", firstName: req.member.firstName, lastName: req.member.lastName, deptName: null, ministryName: null } : null,
          firstName: req.firstName,
          lastName: req.lastName,
          department: null,
          ministry: null,
          requestedRole: req.requestedRole,
          notes: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setReconsidering(null);
    }
  }

  async function rejectRequest(req: PendingRequest) {
    if (!rejectReason.trim()) return;
    setApprovingId(req.id);
    try {
      const res = await fetch(`/api/member-link-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectReason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Erreur lors du refus");
        return;
      }
      setLocalRequests((prev) => prev.filter((r) => r.id !== req.id));
      setRejectingId(null);
      setRejectReason("");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {localRequests.length === 0 && rejected.length === 0 && (
        <p className="text-sm text-gray-400 italic text-center py-8">Aucune demande en attente.</p>
      )}

      {localRequests.map((req) => {
        const displayName = req.member
          ? `${req.member.firstName} ${req.member.lastName}`
          : `${req.firstName ?? ""} ${req.lastName ?? ""}`.trim();

        return (
          <div key={req.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar user={req.user} size={36} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{req.user.name}</p>
                  <p className="text-xs text-gray-400">{req.user.email}</p>
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(req.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Fiche STAR</p>
                {req.member ? (
                  <span className="text-green-700 font-medium">{displayName} <span className="text-xs text-green-500">(existante)</span></span>
                ) : displayName ? (
                  <span className="text-gray-700 font-medium">{displayName} <span className="text-xs text-gray-400">(nouvelle)</span></span>
                ) : (
                  <span className="text-gray-400 italic text-xs">Sans fiche STAR</span>
                )}
              </div>
              {(req.department || req.ministry) && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Département demandé</p>
                  <p className="text-gray-700 font-medium text-sm">
                    {req.department
                      ? `${req.department.ministryName} / ${req.department.name}`
                      : req.ministry?.name}
                  </p>
                </div>
              )}
              {req.requestedRole && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Rôle souhaité</p>
                  <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-icc-violet/10 text-icc-violet border border-icc-violet/20">
                    {REQUESTED_ROLE_LABELS[req.requestedRole] ?? req.requestedRole}
                  </span>
                </div>
              )}
              {req.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Remarques</p>
                  <p className="text-sm text-gray-600 italic">&ldquo;{req.notes}&rdquo;</p>
                </div>
              )}
            </div>

            {rejectingId === req.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Motif du refus (requis)"
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRejectingId(null); setRejectReason(""); }}
                    className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => rejectRequest(req)}
                    disabled={!rejectReason.trim() || approvingId === req.id}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {approvingId === req.id ? "…" : "Confirmer le refus"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejectingId(req.id); setRejectReason(""); }}
                  className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Refuser
                </button>
                <button
                  onClick={() => openApproveModal(req)}
                  disabled={approvingId === req.id}
                  className="flex-1 px-3 py-2 text-sm font-medium bg-icc-violet text-white rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
                >
                  {approvingId === req.id ? "…" : "Approuver"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {rejected.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowRejected((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showRejected ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Demandes refusées ({rejected.length})
          </button>

          {showRejected && (
            <div className="mt-3 space-y-2">
              {rejected.map((r) => {
                const name = r.member
                  ? `${r.member.firstName} ${r.member.lastName}`
                  : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
                return (
                  <div key={r.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{r.user.name}</p>
                        {name && (
                          <p className="text-xs text-gray-500 truncate">{r.member ? "STAR : " : "Nouveau : "}{name}</p>
                        )}
                        {r.requestedRole && (
                          <span className="inline-block mt-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            {REQUESTED_ROLE_LABELS[r.requestedRole] ?? r.requestedRole}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("fr-FR") : "—"}
                      </span>
                    </div>
                    {r.rejectReason && (
                      <p className="mt-1.5 text-xs text-gray-500 italic">&ldquo;{r.rejectReason}&rdquo;</p>
                    )}
                    <div className="mt-2">
                      <button
                        onClick={() => reconsider(r)}
                        disabled={reconsidering === r.id}
                        className="text-xs text-icc-violet border border-icc-violet/30 rounded-lg px-2.5 py-1 hover:bg-icc-violet/5 disabled:opacity-50 transition-colors"
                      >
                        {reconsidering === r.id ? "En cours…" : "↩ Reconsidérer"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {approveModal && (() => {
        const role = approveModal.requestedRole;
        const needsDept = role === "DEPARTMENT_HEAD" || role === "DEPUTY";
        const allDepts = ministries.flatMap((m) =>
          m.departments.map((d) => ({ id: d.id, name: d.name, ministryName: m.name }))
        );
        const displayName = approveModal.member
          ? `${approveModal.member.firstName} ${approveModal.member.lastName}`
          : `${approveModal.firstName ?? ""} ${approveModal.lastName ?? ""}`.trim();
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
            <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-md p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Approuver la demande</h2>
              <p className="text-sm text-gray-600">
                Lier le compte de <strong>{approveModal.user.name}</strong>{" "}
                {displayName && <>à <strong>{displayName}</strong></>}.
              </p>

              {needsDept && allDepts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Département</label>
                  <select
                    value={approveModalDeptId}
                    onChange={(e) => setApproveModalDeptId(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet"
                  >
                    {allDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.ministryName} / {d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setApproveModal(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmApprove}
                  disabled={approvingId === approveModal.id}
                  className="px-4 py-2 text-sm rounded-lg bg-icc-violet text-white hover:bg-icc-violet/90 disabled:opacity-50"
                >
                  {approvingId === approveModal.id ? "…" : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
