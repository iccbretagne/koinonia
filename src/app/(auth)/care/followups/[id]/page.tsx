import { requireAuth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getMsdpFollowUpById, getCareAccess, getCareHistory, listRelatedItems } from "@/modules/care";
import FollowupActions from "./FollowupActions";
import DeleteItemButton from "@/components/DeleteItemButton";
import CareItemFooter from "../../CareItemFooter";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Référent assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
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
    <div className="max-w-xl mx-auto">
      <Link href="/care" className="text-sm text-ink-subtle hover:text-brand-text transition-colors mb-4 inline-block">
        ← Suivi pastoral
      </Link>
      <h1 className="text-2xl font-bold text-ink mb-1">{name || "—"}</h1>
      <p className="text-sm text-ink-muted mb-6">
        {STATUS_LABEL[followUp.status] ?? followUp.status}
        {wasHandedBack && (
          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-warning-soft text-warning">
            Rendu par le référent
          </span>
        )}
      </p>

      <div className="bg-surface rounded-xl border border-line p-5 space-y-3 mb-4">
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
