"use client";

import { useId, useState, type ReactNode } from "react";
import Image from "next/image";
import { ROLE_LABELS as ROLE_LABELS_BASE } from "@/lib/roles";
import { Button, EmptyState, Input, Modal, Select, StatusChip, useToast } from "@/components/ui";
import RejectedLinkRequests from "../RejectedLinkRequests";

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
}

function Avatar({ user, size = 32 }: { readonly user: { name: string; image: string | null }; readonly size?: number }) {
  if (user.image) {
    return <Image src={user.image} alt={user.name} width={size} height={size} className="rounded-full shrink-0" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-brand-soft flex items-center justify-center text-xs font-semibold text-brand-text shrink-0"
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function RequestsPanel({ pendingRequests, rejectedRequests, ministries }: Props) {
  const uid = useId();
  const [localRequests, setLocalRequests] = useState<PendingRequest[]>(pendingRequests);
  const [rejected, setRejected] = useState<RejectedRequest[]>(rejectedRequests);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reconsidering, setReconsidering] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<PendingRequest | null>(null);
  const [approveModalDeptId, setApproveModalDeptId] = useState("");
  const toast = useToast();

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
        toast.error(json.error ?? "Erreur lors de l'approbation");
        return;
      }
      setLocalRequests((prev) => prev.filter((r) => r.id !== approveModal.id));
      setApproveModal(null);
      toast.success("Demande approuvée");
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
      toast.error(e instanceof Error ? e.message : "Une erreur est survenue");
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
        toast.error(json.error ?? "Erreur lors du refus");
        return;
      }
      setLocalRequests((prev) => prev.filter((r) => r.id !== req.id));
      toast.success("Demande refusée");
      setRejectingId(null);
      setRejectReason("");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {localRequests.length === 0 && rejected.length === 0 && (
        <EmptyState size="sm" title="Aucune demande en attente" />
      )}

      {localRequests.map((req) => {
        const displayName = req.member
          ? `${req.member.firstName} ${req.member.lastName}`
          : `${req.firstName ?? ""} ${req.lastName ?? ""}`.trim();

        let starCard: ReactNode;
        if (req.member) {
          starCard = <span className="inline-flex flex-wrap items-center gap-2 font-semibold text-ink">{displayName} <StatusChip tone="success">Fiche existante</StatusChip></span>;
        } else if (displayName) {
          starCard = <span className="inline-flex flex-wrap items-center gap-2 font-semibold text-ink">{displayName} <StatusChip>Nouvelle fiche</StatusChip></span>;
        } else {
          starCard = <span className="text-ink-muted">Sans fiche STAR</span>;
        }

        return (
          <div key={req.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={req.user} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{req.user.name}</p>
                  <p className="truncate text-[13px] leading-[18px] text-ink-muted">{req.user.email}</p>
                </div>
              </div>
              <span className="shrink-0 text-[13px] leading-[18px] text-ink-muted">
                {new Date(req.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-3 text-[15px] leading-[22px] sm:grid-cols-2">
              <div>
                <dt className="mb-0.5 text-[13px] leading-[18px] text-ink-muted">Fiche STAR</dt>
                <dd>{starCard}</dd>
              </div>
              {(req.department || req.ministry) && (
                <div>
                  <dt className="mb-0.5 text-[13px] leading-[18px] text-ink-muted">Département demandé</dt>
                  <dd className="font-semibold text-ink">
                    {req.department
                      ? `${req.department.ministryName} / ${req.department.name}`
                      : req.ministry?.name}
                  </dd>
                </div>
              )}
              {req.requestedRole && (
                <div className="sm:col-span-2">
                  <dt className="mb-0.5 text-[13px] leading-[18px] text-ink-muted">Rôle souhaité</dt>
                  <dd>
                    <StatusChip tone="brand">{REQUESTED_ROLE_LABELS[req.requestedRole] ?? req.requestedRole}</StatusChip>
                  </dd>
                </div>
              )}
              {req.notes && (
                <div className="sm:col-span-2">
                  <dt className="mb-0.5 text-[13px] leading-[18px] text-ink-muted">Remarques</dt>
                  <dd className="text-ink-muted">&ldquo;{req.notes}&rdquo;</dd>
                </div>
              )}
            </dl>

            {rejectingId === req.id ? (
              <div className="flex flex-col gap-2">
                <Input
                  label="Motif du refus"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  hint="Obligatoire : il est communiqué à la personne."
                  required
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    onClick={() => rejectRequest(req)}
                    disabled={!rejectReason.trim() || approvingId === req.id}
                    title={!rejectReason.trim() ? "Indiquez d'abord le motif du refus" : undefined}
                  >
                    {approvingId === req.id ? "Refus…" : "Refuser la demande"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setRejectingId(req.id); setRejectReason(""); }}>
                  Refuser
                </Button>
                <Button type="button" variant="secondary" onClick={() => openApproveModal(req)} disabled={approvingId === req.id}>
                  {approvingId === req.id ? "Approbation…" : "Approuver"}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <RejectedLinkRequests
        rejected={rejected}
        roleLabels={REQUESTED_ROLE_LABELS}
        busyId={reconsidering}
        onReconsider={reconsider}
        className="mt-2"
      />

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
          <Modal open onClose={() => setApproveModal(null)} title="Approuver la demande">
            <div className="flex flex-col gap-4">
              <p className="text-[15px] leading-[22px] text-ink-muted">
                Lier le compte de <strong className="text-ink">{approveModal.user.name}</strong>{" "}
                {displayName && <>à <strong className="text-ink">{displayName}</strong></>}.
              </p>

              {needsDept && allDepts.length > 0 && (
                <Select
                  id={`${uid}-approve-dept`}
                  label="Département"
                  value={approveModalDeptId}
                  onChange={(e) => setApproveModalDeptId(e.target.value)}
                  options={allDepts.map((d) => ({ value: d.id, label: `${d.ministryName} / ${d.name}` }))}
                />
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setApproveModal(null)}>
                  Annuler
                </Button>
                <Button type="button" onClick={confirmApprove} disabled={approvingId === approveModal.id}>
                  {approvingId === approveModal.id ? "Approbation…" : "Approuver la demande"}
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
