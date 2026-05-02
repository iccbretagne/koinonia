"use client";

import { useState } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

type Department = { id: string; name: string; ministryName: string };

type RequestedRole = "DEPARTMENT_HEAD" | "DEPUTY" | "MINISTER" | "DISCIPLE_MAKER" | "REPORTER" | null;

const ROLE_LABELS: Record<NonNullable<RequestedRole>, string> = {
  DEPARTMENT_HEAD: "Responsable de département",
  DEPUTY: "Adjoint",
  MINISTER: "Ministre",
  DISCIPLE_MAKER: "Faiseur de disciples",
  REPORTER: "Reporter",
};

interface LinkRequest {
  id: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  member: {
    id: string;
    firstName: string;
    lastName: string;
    departments: { isPrimary: boolean; department: { name: string; ministry: { name: string } } }[];
  } | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  church: { id: string; name: string };
  createdAt: string;
  requestedRole: RequestedRole;
  notes: string | null;
}

interface RejectedRequest {
  id: string;
  user: { name: string | null; email: string };
  member: { firstName: string; lastName: string } | null;
  firstName: string | null;
  lastName: string | null;
  requestedRole: RequestedRole;
  rejectReason: string | null;
  reviewedAt: string | null;
}

export default function LinkRequestsClient({
  initialRequests,
  departments,
  rejectedRequests = [],
}: {
  initialRequests: LinkRequest[];
  departments: Department[];
  rejectedRequests?: RejectedRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [rejected, setRejected] = useState(rejectedRequests);
  const [showRejected, setShowRejected] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<LinkRequest | null>(null);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [rejectModal, setRejectModal] = useState<LinkRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0 && rejected.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">Aucune demande en attente.</p>
    );
  }

  async function handleAction(
    id: string,
    action: "approve" | "reject",
    extra: Record<string, string | undefined> = {}
  ) {
    setError(null);
    setProcessing(id);
    try {
      const res = await fetch(`/api/member-link-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setApproveModal(null);
      setRejectModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setProcessing(null);
    }
  }

  async function reconsider(req: RejectedRequest) {
    setProcessing(req.id);
    try {
      const res = await fetch(`/api/member-link-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconsider" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRejected((prev) => prev.filter((r) => r.id !== req.id));
      // Réintègre la demande dans la liste en attente (données minimales disponibles)
      setRequests((prev) => [
        ...prev,
        {
          id: req.id,
          user: { id: "", ...req.user, image: null },
          member: req.member ? { id: "", ...req.member, departments: [] } : null,
          firstName: req.firstName,
          lastName: req.lastName,
          phone: null,
          church: { id: "", name: "" },
          createdAt: new Date().toISOString(),
          requestedRole: req.requestedRole,
          notes: null,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="border-2 border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {req.user.image ? (
                  <Image
                    src={req.user.image}
                    alt=""
                    width={40}
                    height={40}
                    className="rounded-full shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-icc-violet/10 flex items-center justify-center shrink-0">
                    <span className="text-icc-violet font-semibold text-sm">
                      {(req.user.name ?? req.user.email)[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {req.user.name ?? req.user.email}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{req.user.email}</p>
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(req.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>

            <div className="mt-3 text-sm">
              {req.member ? (
                <p className="text-gray-600">
                  Revendique la fiche :{" "}
                  <strong>{req.member.firstName} {req.member.lastName}</strong>
                  {(() => { const pd = req.member.departments.find((d) => d.isPrimary) ?? req.member.departments[0]; return pd ? <span className="text-gray-400"> · {pd.department.ministry.name} / {pd.department.name}</span> : null; })()}
                </p>
              ) : (
                <p className="text-gray-600">
                  Création d&apos;un nouveau STAR :{" "}
                  <strong>{req.firstName} {req.lastName}</strong>
                  {req.phone && <span className="text-gray-400"> · {req.phone}</span>}
                </p>
              )}
              <p className="text-gray-400 text-xs mt-0.5">Église : {req.church.name}</p>
              {req.requestedRole && (
                <p className="text-xs mt-1">
                  <span className="inline-block bg-icc-violet/10 text-icc-violet px-1.5 py-0.5 rounded font-medium">
                    {ROLE_LABELS[req.requestedRole]}
                  </span>
                </p>
              )}
              {req.notes && (
                <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{req.notes}&rdquo;</p>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => { setApproveModal(req); setError(null); }}
                disabled={processing === req.id}
              >
                Approuver
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setRejectModal(req); setRejectReason(""); setError(null); }}
                disabled={processing === req.id}
              >
                Rejeter
              </Button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-icc-rouge">{error}</p>}

      {/* Demandes refusées */}
      {rejected.length > 0 && (
        <div className="mt-4">
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
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {r.user.name ?? r.user.email}
                        </p>
                        {name && (
                          <p className="text-xs text-gray-500 truncate">{r.member ? "STAR : " : "Nouveau : "}{name}</p>
                        )}
                        {r.requestedRole && (
                          <span className="inline-block mt-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            {ROLE_LABELS[r.requestedRole]}
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
                        disabled={processing === r.id}
                        className="text-xs text-icc-violet border border-icc-violet/30 rounded-lg px-2.5 py-1 hover:bg-icc-violet/5 disabled:opacity-50 transition-colors"
                      >
                        {processing === r.id ? "En cours…" : "↩ Reconsidérer"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal approbation */}
      <Modal
        open={!!approveModal}
        onClose={() => setApproveModal(null)}
        title="Approuver la demande"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Lier le compte de{" "}
            <strong>{approveModal?.user.name ?? approveModal?.user.email}</strong>
            {" "}à{" "}
            <strong>
              {approveModal?.member
                ? `${approveModal.member.firstName} ${approveModal.member.lastName}`
                : `${approveModal?.firstName} ${approveModal?.lastName}`}
            </strong>
            {" "}dans <strong>{approveModal?.church.name}</strong>.
          </p>

          {(() => {
            const role = approveModal?.requestedRole;
            const needsDept = !approveModal?.member || role === "DEPARTMENT_HEAD" || role === "DEPUTY";
            if (!needsDept) return null;
            return (
              <Select
                label={approveModal?.member ? "Département (pour le rôle)" : "Département (pour la fiche STAR)"}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                options={departments.map((d) => ({
                  value: d.id,
                  label: `${d.ministryName} / ${d.name}`,
                }))}
              />
            );
          })()}

          {error && <p className="text-sm text-icc-rouge">{error}</p>}

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setApproveModal(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                const role = approveModal?.requestedRole;
                const needsDept = !approveModal?.member || role === "DEPARTMENT_HEAD" || role === "DEPUTY";
                handleAction(approveModal!.id, "approve", {
                  departmentId: needsDept ? departmentId : undefined,
                });
              }}
              disabled={processing === approveModal?.id}
            >
              {processing === approveModal?.id ? "En cours..." : "Confirmer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal rejet */}
      <Modal
        open={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title="Rejeter la demande"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Motif du rejet (optionnel)
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Ex : fiche introuvable, doublon..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
          />
          {error && <p className="text-sm text-icc-rouge">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRejectModal(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                handleAction(rejectModal!.id, "reject", {
                  rejectReason: rejectReason || undefined,
                })
              }
              disabled={processing === rejectModal?.id}
            >
              {processing === rejectModal?.id ? "En cours..." : "Rejeter"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
