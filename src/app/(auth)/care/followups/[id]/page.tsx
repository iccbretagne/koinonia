import { requireAuth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getMsdpFollowUpById, getCareAccess, getCareHistory, listRelatedItems } from "@/modules/care";
import FollowupActions from "./FollowupActions";
import DeleteItemButton from "@/components/DeleteItemButton";
import CareItemFooter from "../../CareItemFooter";
import { PageHeader, StatusChip, type StatusTone } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Référent assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
};

const STATUS_TONE: Record<string, StatusTone> = {
  SUBMITTED: "warning",
  ASSIGNED: "info",
  CONTACTED: "info",
  IN_FORMATION: "brand",
  COMPLETED: "success",
  ABANDONED: "danger",
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  assign: "Affectée",
  reassign: "Réaffectée",
  contact: "Marquée contactée",
  in_formation: "Passée en formation",
  complete: "Marquée terminée",
  abandon: "Abandonnée",
  reopen: "Rouverte",
  handback: "Rendue au référent",
  note: "Note enregistrée",
};

const RELATED_STATUS_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

export default async function CareFollowupDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const followUp = await getMsdpFollowUpById(id);
  if (!followUp) return notFound();

  const session = await requireAuth();
  const access = await getCareAccess(session, followUp.churchId);
  const isCurrentAssignee =
    session.user.id === followUp.assignedConseillerMsdpId ||
    session.user.id === followUp.assignedProfile?.userId;
  if (!access.canOverview && !isCurrentAssignee) return notFound();

  const name = followUp.firstName && followUp.lastName
    ? `${followUp.firstName} ${followUp.lastName}`
    : `${followUp.request?.firstName ?? ""} ${followUp.request?.lastName ?? ""}`.trim();

  const [history, related] = await Promise.all([
    getCareHistory("followups", id),
    followUp.personJourneyId
      ? listRelatedItems(followUp.personJourneyId, { kind: "followup", id })
      : Promise.resolve([]),
  ]);
  const wasHandedBack = followUp.status === "SUBMITTED" && history.at(-1)?.action === "handback";

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader className="mb-6" eyebrow="Suivi de nouveau converti" title={name || "—"}>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone={STATUS_TONE[followUp.status] ?? "neutral"}>{STATUS_LABEL[followUp.status] ?? followUp.status}</StatusChip>
          {wasHandedBack && <StatusChip tone="warning">Rendu par le référent</StatusChip>}
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3">
        {followUp.assignedConseillerMsdp && (
          <p className="text-sm text-ink-muted">
            Référent : <strong>{followUp.assignedConseillerMsdp.name ?? followUp.assignedConseillerMsdp.email}</strong>
          </p>
        )}
        {followUp.assignedProfile && (
          <p className="text-sm text-ink-muted">
            Référent : <strong>{followUp.assignedProfile.name}</strong>
          </p>
        )}
        {followUp.notes && <p className="text-sm text-ink-muted whitespace-pre-line">{followUp.notes}</p>}
      </div>

      <FollowupActions
        followUpId={id}
        churchId={followUp.churchId}
        status={followUp.status}
        isReferent={access.canQualify}
        isCurrentAssignee={isCurrentAssignee}
        notes={followUp.notes ?? ""}
      />

      {access.canDelete && (
        <div className="mt-4 flex justify-end">
          <DeleteItemButton endpoint={`/api/care/followups/${id}`} redirectTo="/care" />
        </div>
      )}

      <CareItemFooter
        related={related}
        relatedStatusLabels={RELATED_STATUS_LABEL}
        historyUrl={`/api/care/items/followups/${id}/history`}
        statusLabels={STATUS_LABEL}
        actionLabels={HISTORY_ACTION_LABELS}
      />
    </div>
  );
}
