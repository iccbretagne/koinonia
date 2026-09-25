import { requireAuth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getMsdpFollowUpById, getCareAccess, getCareHistory, listRelatedItems } from "@/modules/care";
import FollowupActions from "./FollowupActions";
import HistoryTimeline from "@/components/HistoryTimeline";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Conseiller assigné",
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
      <Link href="/care" className="text-sm text-gray-400 hover:text-icc-violet transition-colors mb-4 inline-block">
        ← Suivi pastoral
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{name || "—"}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {STATUS_LABEL[followUp.status] ?? followUp.status}
        {wasHandedBack && (
          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            Rendu par le conseiller
          </span>
        )}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 mb-4">
        {followUp.assignedConseillerMsdp && (
          <p className="text-sm text-gray-600">
            Conseiller : <strong>{followUp.assignedConseillerMsdp.name ?? followUp.assignedConseillerMsdp.email}</strong>
          </p>
        )}
        {followUp.assignedProfile && (
          <p className="text-sm text-gray-600">
            Conseiller : <strong>{followUp.assignedProfile.name}</strong>
          </p>
        )}
        {followUp.notes && <p className="text-sm text-gray-600 whitespace-pre-line">{followUp.notes}</p>}
      </div>

      <FollowupActions
        followUpId={id}
        churchId={followUp.churchId}
        status={followUp.status}
        isReferent={access.canQualify}
        isCurrentAssignee={isCurrentAssignee}
        notes={followUp.notes ?? ""}
      />

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
          fetchUrl={`/api/care/items/followups/${id}/history`}
          statusLabels={STATUS_LABEL}
          actionLabels={HISTORY_ACTION_LABELS}
          assigneeLabel="Conseiller"
        />
      </div>
    </div>
  );
}
