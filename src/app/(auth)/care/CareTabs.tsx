"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  Select,
  StatusChip,
  Textarea,
  fieldLabelClasses,
  type StatusTone,
} from "@/components/ui";
import AssigneeSelect, { type AssigneeValue } from "./AssigneeSelect";

const REJECT_REASON_OPTIONS: [string, string][] = [
  ["OUT_OF_SCOPE", "Hors du champ pastoral"],
  ["DUPLICATE", "Doublon"],
  ["WITHDRAWN", "Demande retirée par la personne"],
  ["UNREACHABLE", "Injoignable"],
  ["REDIRECTED", "Orientée vers un autre service"],
  ["OTHER", "Autre"],
];

interface Requester { id: string; name: string | null; displayName: string | null }
interface AppointmentRequestItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  subject?: string;
  message?: string | null;
  masked: boolean;
  createdAt: Date | string;
  user: Requester | null;
}
interface FollowUpItem {
  id: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date | string;
  assignedConseillerMsdp: { id: string; name: string | null; email: string | null } | null;
  assignedProfile: { id: string; name: string } | null;
  request: { id: string; firstName: string; lastName: string } | null;
}

interface Props {
  readonly churchId: string;
  readonly canQualify: boolean;
  readonly requests: AppointmentRequestItem[];
  readonly followUps: FollowUpItem[];
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const REQUEST_STATUS_TONES: Record<string, StatusTone> = {
  PENDING: "warning",
  VALIDATED: "info",
  SCHEDULED: "success",
  CLOSED: "neutral",
  REJECTED: "danger",
};

const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Référent assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
};

const MSDP_STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED: "warning",
  ASSIGNED: "info",
  CONTACTED: "info",
  IN_FORMATION: "brand",
  COMPLETED: "success",
  ABANDONED: "danger",
};

function QualifyForm({ req, churchId, onDone, onCancel }: {
  readonly req: AppointmentRequestItem;
  readonly churchId: string;
  readonly onDone: (id: string) => void;
  readonly onCancel: () => void;
}) {
  const uid = useId();
  const [assignee, setAssignee] = useState<AssigneeValue | null>(null);
  const [note, setNote] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
  const [processing, setProcessing] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(`/api/care/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Erreur lors de l'enregistrement");
        return;
      }
      onDone(req.id);
    } catch {
      setError("Erreur réseau");
    } finally {
      setProcessing(false);
    }
  }

  function validate() {
    if (!assignee) return;
    void send({ action: "validate", assignee, note: note || undefined });
  }

  function reject() {
    setConfirmReject(false);
    void send({ action: "reject", reasonCode, comment: comment || undefined });
  }

  if (rejectMode) {
    return (
      <div className="flex flex-col gap-3">
        <Select
          label="Motif de refus"
          required
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
          placeholder="Choisir un motif…"
          options={REJECT_REASON_OPTIONS.map(([value, label]) => ({ value, label }))}
          hint={reasonCode ? undefined : "Choisissez un motif pour refuser la demande."}
        />
        <Textarea
          label="Commentaire (facultatif)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button size="sm" variant="secondary" onClick={() => setRejectMode(false)} disabled={processing}>
            Annuler
          </Button>
          <Button size="sm" onClick={() => setConfirmReject(true)} disabled={processing || !reasonCode}>
            {processing ? "Refus en cours…" : "Refuser la demande"}
          </Button>
        </div>
        <ConfirmModal
          open={confirmReject}
          title="Refuser cette demande ?"
          message="Le refus est définitif : la demande ne pourra plus être confiée."
          confirmLabel="Refuser la demande"
          confirmingLabel="Refus en cours…"
          variant="primary"
          confirming={processing}
          onConfirm={reject}
          onCancel={() => setConfirmReject(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={`${uid}-assignee`} className={`${fieldLabelClasses} mb-1.5 block`}>
          Référent
        </label>
        <AssigneeSelect id={`${uid}-assignee`} churchId={churchId} value={assignee} onChange={setAssignee} />
        {!assignee && <p className="mt-1.5 text-[13px] text-ink-muted">Choisissez un référent pour confier la demande.</p>}
      </div>
      <Textarea
        label="Note transmise au référent (facultatif)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={processing}>
          Annuler
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejectMode(true)} disabled={processing}>
          Refuser la demande
        </Button>
        <Button size="sm" onClick={validate} disabled={processing || !assignee}>
          {processing ? "Envoi en cours…" : "Confier la demande"}
        </Button>
      </div>
    </div>
  );
}

const rowLinkClasses =
  "flex min-h-11 items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card transition-colors " +
  "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function RequestsTab({ requests: initial, churchId }: { readonly requests: AppointmentRequestItem[]; readonly churchId: string }) {
  const [requests, setRequests] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "PENDING");
  const others = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="flex flex-col gap-6">
      {pending.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState size="sm" title="Aucune demande en attente de qualification" />
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((req) => (
            <li key={req.id} className="rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{req.firstName} {req.lastName}</p>
                  <p className="mt-0.5 break-words text-xs text-ink-muted">{req.email} {req.phone && `· ${req.phone}`}</p>
                  {!req.masked && <p className="mt-1 text-sm font-semibold text-ink">{req.subject}</p>}
                  {!req.masked && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{req.message}</p>}
                </div>
                <span className="shrink-0 text-xs text-ink-muted">
                  {new Date(req.createdAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div className="mt-3 border-t border-line pt-3">
                {expanded === req.id ? (
                  <QualifyForm
                    req={req}
                    churchId={churchId}
                    onCancel={() => setExpanded(null)}
                    onDone={(id) => { setRequests((prev) => prev.filter((r) => r.id !== id)); setExpanded(null); }}
                  />
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setExpanded(req.id)}>
                    Traiter la demande
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Autres demandes</h3>
          <ul className="flex flex-col gap-2">
            {others.map((req) => (
              <li key={req.id}>
                <Link href={`/care/requests/${req.id}`} className={rowLinkClasses}>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{req.firstName} {req.lastName}</p>
                    <p className="text-xs text-ink-muted">{new Date(req.createdAt).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <StatusChip tone={REQUEST_STATUS_TONES[req.status] ?? "neutral"}>
                      {REQUEST_STATUS_LABELS[req.status] ?? req.status}
                    </StatusChip>
                    <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FollowupsTab({ followUps }: { readonly followUps: FollowUpItem[] }) {
  if (followUps.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState size="sm" title="Aucun suivi de nouveau converti" />
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {followUps.map((f) => {
        const name = f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : `${f.request?.firstName ?? ""} ${f.request?.lastName ?? ""}`.trim();
        // Référent : membre du MSDP ou profil pastoral, l'un ou l'autre, jamais les deux.
        const referent = f.assignedConseillerMsdp
          ? f.assignedConseillerMsdp.name ?? f.assignedConseillerMsdp.email
          : f.assignedProfile?.name ?? null;
        return (
          <li key={f.id}>
            <Link href={`/care/followups/${f.id}`} className={rowLinkClasses}>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{name || "—"}</p>
                <p className="text-xs text-ink-muted">
                  {referent ? `Référent : ${referent}` : "Sans référent"}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1">
                <StatusChip tone={MSDP_STATUS_TONES[f.status] ?? "neutral"}>
                  {MSDP_STATUS_LABELS[f.status] ?? f.status}
                </StatusChip>
                <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function CareTabs({ canQualify, requests, followUps, churchId }: Props) {
  const uid = useId();
  const [tab, setTab] = useState<"requests" | "followups">("requests");
  const pendingCount = canQualify ? requests.filter((r) => r.status === "PENDING").length : 0;
  const tabs = [
    { id: "requests" as const, label: "Rendez-vous", count: pendingCount },
    { id: "followups" as const, label: "Nouveaux convertis", count: 0 },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Suivi pastoral" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${uid}-panel`}
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-display text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              tab === t.id ? "border-brand text-brand-text" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <>
                <Badge count={t.count} />
                <span className="sr-only">
                  {t.count > 1 ? `${t.count} demandes en attente` : "1 demande en attente"}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
        {tab === "requests" ? (
          <RequestsTab requests={requests} churchId={churchId} />
        ) : (
          <FollowupsTab followUps={followUps} />
        )}
      </div>
    </div>
  );
}
