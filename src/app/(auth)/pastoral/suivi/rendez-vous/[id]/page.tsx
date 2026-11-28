import { requireAuth, resolveChurchId } from "@/lib/auth";
import { notFound } from "next/navigation";
import {
  getCareAccess,
  getAppointmentRequestById,
  resolveRequestReaderAccess,
  projectRequest,
  getCareHistory,
  listRelatedItems,
  getAppointmentDeletionInfo,
} from "@/modules/care";
import RequestActions from "./RequestActions";
import DeleteItemButton from "@/components/DeleteItemButton";
import CareItemFooter from "../../CareItemFooter";
import { PageHeader, StatusChip, type StatusTone } from "@/components/ui";
import { paths } from "@/lib/paths";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: "warning",
  VALIDATED: "info",
  SCHEDULED: "success",
  CLOSED: "neutral",
  REJECTED: "danger",
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  validate: "Confiée",
  reject: "Refusée",
  reassign: "Réaffectée",
  set_date: "Date fixée",
  outcome: "Compte rendu renseigné",
  handback: "Rendue pour réaffectation",
};

const RELATED_STATUS_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  SUBMITTED: "Reçu",
  ASSIGNED: "Référent assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
};

export default async function CareRequestDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Demande supprimée (spec 057) : `resolveChurchId` lève un 404 — on affiche `not-found.tsx`.
  const churchId = await resolveChurchId("appointmentRequest", id).catch(() => null);
  if (!churchId) return notFound();
  const session = await requireAuth();
  const access = await getCareAccess(session, churchId);

  const item = await getAppointmentRequestById(id);
  if (item?.churchId !== churchId) return notFound();

  const readerAccess = resolveRequestReaderAccess({
    canQualify: access.canQualify,
    currentUserId: access.userId,
    assignedToUserId: item.assignedTo?.userId ?? null,
    assignedMemberId: item.assignedMemberId,
  });
  if (!access.canOverview && !readerAccess.canReadContent) return notFound();

  const projected = projectRequest(item, readerAccess);

  const isCurrentAssignee =
    item.assignedMemberId === access.userId || item.assignedTo?.userId === access.userId;
  const isMemberAssignee = !!item.assignedMemberId;
  const canActAsAssigneeProxy = access.canQualify && !!item.assignedTo && !item.assignedTo.userId;

  const [history, related, deletionInfo] = await Promise.all([
    getCareHistory("requests", id),
    item.personJourneyId && readerAccess.canReadContent
      ? listRelatedItems(item.personJourneyId, { kind: "request", id })
      : Promise.resolve([]),
    access.canDelete ? getAppointmentDeletionInfo(id) : Promise.resolve(null),
  ]);
  const wasHandedBack = item.status === "PENDING" && history.at(-1)?.action === "handback";

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader className="mb-6" eyebrow="Rendez-vous pastoral" title={`${item.firstName} ${item.lastName}`}>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone={STATUS_TONE[item.status] ?? "neutral"}>{STATUS_LABEL[item.status] ?? item.status}</StatusChip>
          {wasHandedBack && <StatusChip tone="warning">Rendue par le référent</StatusChip>}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-3">
        <p className="break-words text-sm text-ink-muted">
          {item.email} {item.phone && `· ${item.phone}`}
        </p>
        {!projected.masked ? (
          <>
            <p className="text-sm font-semibold text-ink">{projected.subject}</p>
            <p className="text-sm text-ink-muted whitespace-pre-line">{projected.message}</p>
          </>
        ) : (
          <p className="text-sm italic text-ink-muted">Contenu confidentiel — réservé aux Référents soins pastoraux et au référent en charge.</p>
        )}
        {item.assignedTo && (
          <p className="text-sm text-ink-muted">Référent : <strong>{item.assignedTo.name}</strong></p>
        )}
        {item.assignedMember && (
          <p className="text-sm text-ink-muted">
            Référent : <strong>{item.assignedMember.name ?? item.assignedMember.email}</strong>
          </p>
        )}
        {item.scheduledFor && (
          <p className="text-sm text-ink-muted">
            Rendez-vous : <strong>{new Date(item.scheduledFor).toLocaleString("fr-FR")}</strong>
          </p>
        )}
      </div>

      <div className="mt-4">
        <RequestActions
          requestId={id}
          churchId={churchId}
          status={item.status}
          isReferent={access.canQualify}
          isCurrentAssignee={isCurrentAssignee}
          isMemberAssignee={isMemberAssignee}
          canActAsAssigneeProxy={canActAsAssigneeProxy}
        />
      </div>

      {deletionInfo && (
        <div className="mt-4 flex justify-end">
          <DeleteItemButton
            endpoint={`/api/care/requests/${id}`}
            redirectTo={paths.care()}
            extraMessage={
              deletionInfo.hasAgendaEntry ? "Le rendez-vous planifié dans l'agenda sera aussi supprimé." : undefined
            }
            blockedBy={
              deletionInfo.followUpId
                ? [{ label: "Suivi de nouveau converti lié", href: paths.care.followup(deletionInfo.followUpId) }]
                : []
            }
          />
        </div>
      )}

      <CareItemFooter
        related={related}
        relatedStatusLabels={RELATED_STATUS_LABEL}
        historyUrl={`/api/care/items/requests/${id}/history`}
        statusLabels={STATUS_LABEL}
        actionLabels={HISTORY_ACTION_LABELS}
      />
    </div>
  );
}
