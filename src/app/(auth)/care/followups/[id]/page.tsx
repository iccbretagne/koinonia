import { requireAuth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getMsdpFollowUpById, hasFollowupManagementAccess } from "@/modules/care";
import FollowupActions from "./FollowupActions";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Conseiller assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
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
  const isManager = await hasFollowupManagementAccess(session, followUp.churchId);
  const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
  if (!isManager && !isCounselor) return notFound();

  const name = followUp.firstName && followUp.lastName
    ? `${followUp.firstName} ${followUp.lastName}`
    : `${followUp.request?.firstName ?? ""} ${followUp.request?.lastName ?? ""}`.trim();

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/care" className="text-sm text-gray-400 hover:text-icc-violet transition-colors mb-4 inline-block">
        ← Suivi pastoral
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{name || "—"}</h1>
      <p className="text-sm text-gray-500 mb-6">{STATUS_LABEL[followUp.status] ?? followUp.status}</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 mb-4">
        {followUp.assignedConseillerMsdp && (
          <p className="text-sm text-gray-600">
            Conseiller : <strong>{followUp.assignedConseillerMsdp.name ?? followUp.assignedConseillerMsdp.email}</strong>
          </p>
        )}
        {followUp.notes && <p className="text-sm text-gray-600 whitespace-pre-line">{followUp.notes}</p>}
      </div>

      <FollowupActions
        followUpId={id}
        churchId={followUp.churchId}
        status={followUp.status}
        isManager={isManager}
        notes={followUp.notes ?? ""}
      />
    </div>
  );
}
