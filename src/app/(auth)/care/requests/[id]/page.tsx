import { requireAuth, resolveChurchId } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCareAccess,
  getAppointmentRequestById,
  resolveRequestReaderAccess,
  projectRequest,
  getCareHistory,
  listRelatedItems,
} from "@/modules/care";
import RequestActions from "./RequestActions";
import HistoryTimeline from "@/components/HistoryTimeline";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  validate: "Confiée",
  reject: "Refusée",
  reassign: "Réaffectée",
  set_date: "Date fixée",
  outcome: "Compte rendu renseigné",
  handback: "Rendue au référent",
};

const RELATED_STATUS_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  SUBMITTED: "Reçu",
  ASSIGNED: "Conseiller assigné",
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
  const churchId = await resolveChurchId("appointmentRequest", id);
  const session = await requireAuth();
  const access = await getCareAccess(session, churchId);

  const item = await getAppointmentRequestById(id);
  if (!item || item.churchId !== churchId) return notFound();

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

  const [history, related] = await Promise.all([
    getCareHistory("requests", id),
    item.personJourneyId && readerAccess.canReadContent
      ? listRelatedItems(item.personJourneyId, { kind: "request", id })
      : Promise.resolve([]),
  ]);
  const wasHandedBack = item.status === "PENDING" && history.at(-1)?.action === "handback";

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/care" className="text-sm text-gray-400 hover:text-icc-violet transition-colors mb-4 inline-block">
        ← Suivi pastoral
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{item.firstName} {item.lastName}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {STATUS_LABEL[item.status] ?? item.status}
        {wasHandedBack && (
          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            Rendu par l&apos;accompagnant
          </span>
        )}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm text-gray-600">
          {item.email} {item.phone && `· ${item.phone}`}
        </p>
        {!projected.masked ? (
          <>
            <p className="text-sm font-medium text-gray-800">{projected.subject}</p>
            <p className="text-sm text-gray-600 whitespace-pre-line">{projected.message}</p>
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">Contenu confidentiel — réservé au référent et à l&apos;accompagnant en charge.</p>
        )}
        {item.assignedTo && (
          <p className="text-sm text-gray-600">Accompagnant : <strong>{item.assignedTo.name}</strong></p>
        )}
        {item.assignedMember && (
          <p className="text-sm text-gray-600">
            Accompagnant : <strong>{item.assignedMember.name ?? item.assignedMember.email}</strong>
          </p>
        )}
        {item.scheduledFor && (
          <p className="text-sm text-gray-600">
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

      {related.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Autres demandes de la personne</h2>
          <ul className="space-y-1.5">
            {related.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={r.kind === "request" ? `/care/requests/${r.id}` : `/care/followups/${r.id}`}
                  className="text-sm text-icc-violet hover:underline"
                >
                  {r.kind === "request" ? "Rendez-vous pastoral" : "Suivi de nouveau converti"} —{" "}
                  {RELATED_STATUS_LABEL[r.status] ?? r.status}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <HistoryTimeline
          fetchUrl={`/api/care/items/requests/${id}/history`}
          statusLabels={STATUS_LABEL}
          actionLabels={HISTORY_ACTION_LABELS}
        />
      </div>
    </div>
  );
}
