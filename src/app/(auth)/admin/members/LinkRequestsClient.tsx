"use client";

import { useState } from "react";
import Image from "next/image";
import { Alert, Button, EmptyState, Modal, Select, StatusChip, Textarea } from "@/components/ui";
import { ROLE_LABELS as ROLE_LABELS_BASE } from "@/lib/roles";
import RejectedLinkRequests from "../RejectedLinkRequests";

type Department = { id: string; name: string; ministryName: string };

type RequestedRole = "DEPARTMENT_HEAD" | "DEPUTY" | "MINISTER" | "DISCIPLE_MAKER" | "REPORTER" | null;

// DEPUTY n'est pas un rôle d'église (Role) — c'est un attribut (isDeputy) d'un DEPARTMENT_HEAD —
// d'où ce libellé propre, les autres venant de la source unique `@/lib/roles` (spec 054).
const ROLE_LABELS: Record<NonNullable<RequestedRole>, string> = {
  DEPARTMENT_HEAD: ROLE_LABELS_BASE.DEPARTMENT_HEAD,
  DEPUTY: "Adjoint",
  MINISTER: ROLE_LABELS_BASE.MINISTER,
  DISCIPLE_MAKER: ROLE_LABELS_BASE.DISCIPLE_MAKER,
  REPORTER: ROLE_LABELS_BASE.REPORTER,
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
  readonly initialRequests: LinkRequest[];
  readonly departments: Department[];
  readonly rejectedRequests?: RejectedRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [rejected, setRejected] = useState(rejectedRequests);
  const [processing, setProcessing] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<LinkRequest | null>(null);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [rejectModal, setRejectModal] = useState<LinkRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0 && rejected.length === 0) {
    return (
      <EmptyState size="sm" title="Aucune demande en attente" />
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
      <div className="flex flex-col gap-3">
        {requests.map((req) => (
          <div key={req.id} className="rounded-card border border-line bg-surface p-4">
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
                  <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
                    <span className="text-brand-text font-semibold text-sm">
                      {(req.user.name ?? req.user.email)[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">
                    {req.user.name ?? req.user.email}
                  </p>
                  <p className="truncate text-[13px] text-ink-muted">{req.user.email}</p>
                </div>
              </div>
              <span className="shrink-0 text-[13px] leading-[18px] text-ink-muted">
                {new Date(req.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>

            <div className="mt-3 text-sm">
              {req.member ? (
                <p className="text-ink-muted">
                  Revendique la fiche :{" "}
                  <strong className="text-ink">{req.member.firstName} {req.member.lastName}</strong>
                  {(() => { const pd = req.member.departments.find((d) => d.isPrimary) ?? req.member.departments[0]; return pd ? <span className="text-ink-muted"> · {pd.department.ministry.name} / {pd.department.name}</span> : null; })()}
                </p>
              ) : (
                <p className="text-ink-muted">
                  Création d&apos;un nouveau STAR :{" "}
                  <strong className="text-ink">{req.firstName} {req.lastName}</strong>
                  {req.phone && <span className="text-ink-muted"> · {req.phone}</span>}
                </p>
              )}
              <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Église : {req.church.name}</p>
              {req.requestedRole && (
                <p className="mt-1">
                  <StatusChip tone="brand">{ROLE_LABELS[req.requestedRole]}</StatusChip>
                </p>
              )}
              {req.notes && (
                <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">&ldquo;{req.notes}&rdquo;</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setApproveModal(req); setError(null); }}
                disabled={processing === req.id}
              >
                Approuver
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setRejectModal(req); setRejectReason(""); setError(null); }}
                disabled={processing === req.id}
              >
                Rejeter
              </Button>
            </div>
          </div>
        ))}
      </div>

      {error && !approveModal && !rejectModal && <Alert tone="danger" className="mt-2">{error}</Alert>}

      {/* Demandes refusées */}
      <RejectedLinkRequests
        rejected={rejected}
        roleLabels={ROLE_LABELS}
        busyId={processing}
        onReconsider={reconsider}
        className="mt-4"
      />

      {/* Modal approbation */}
      <Modal
        open={!!approveModal}
        onClose={() => setApproveModal(null)}
        title="Approuver la demande"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
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

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setApproveModal(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                const role = approveModal?.requestedRole;
                const needsDept = !approveModal?.member || role === "DEPARTMENT_HEAD" || role === "DEPUTY";
                void handleAction(approveModal!.id, "approve", {
                  departmentId: needsDept ? departmentId : undefined,
                });
              }}
              disabled={processing === approveModal?.id}
            >
              {processing === approveModal?.id ? "Approbation…" : "Approuver la demande"}
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
          <Textarea
            label="Motif du rejet (facultatif)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Ex : fiche introuvable, doublon…"
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRejectModal(null)}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                handleAction(rejectModal!.id, "reject", {
                  rejectReason: rejectReason || undefined,
                })
              }
              disabled={processing === rejectModal?.id}
            >
              {processing === rejectModal?.id ? "Rejet…" : "Rejeter la demande"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
