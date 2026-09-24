import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import {
  getCareAccess,
  listAppointmentRequests,
  listMsdpFollowUps,
  resolveRequestReaderAccess,
  projectRequest,
} from "@/modules/care";
import CareTabs from "./CareTabs";

/**
 * Espace « Suivi pastoral » (spec 052) — deux onglets : Rendez-vous (ex-`/agenda/requests`,
 * qualification) et Nouveaux convertis (suivis MSDP). Un accompagnant sans `care:qualify`/
 * `care:view` n'y voit que ses propres demandes/suivis en charge.
 */
export default async function CarePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const access = await getCareAccess(session, churchId);
  if (!access.canOverview && access.ownProfileIds.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 text-gray-400">
        <p className="text-lg">Aucun accès à l&apos;espace suivi pastoral.</p>
      </div>
    );
  }

  const [allRequests, allFollowUps] = await Promise.all([
    listAppointmentRequests(churchId, ["PENDING", "VALIDATED", "SCHEDULED", "CLOSED", "REJECTED"]),
    listMsdpFollowUps(churchId),
  ]);

  const requests = access.canOverview
    ? allRequests
    : allRequests.filter(
        (r) =>
          (r.assignedTo && access.ownProfileIds.includes(r.assignedTo.id)) ||
          r.assignedMemberId === access.userId
      );

  const projectedRequests = requests.map((r) =>
    projectRequest(
      r,
      resolveRequestReaderAccess({
        canQualify: access.canQualify,
        currentUserId: access.userId,
        assignedToUserId: r.assignedTo?.userId ?? null,
        assignedMemberId: r.assignedMemberId,
      })
    )
  );

  const followUps = access.canOverview
    ? allFollowUps
    : allFollowUps.filter(
        (f) =>
          f.assignedConseillerMsdpId === access.userId ||
          (f.assignedProfile && access.ownProfileIds.includes(f.assignedProfile.id))
      );

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Suivi pastoral</h1>
      <p className="text-sm text-gray-500 mb-6">
        Demandes de rendez-vous pastoral et suivi des nouveaux convertis.
      </p>
      <CareTabs
        churchId={churchId}
        canQualify={access.canQualify}
        requests={projectedRequests}
        followUps={followUps}
      />
    </div>
  );
}
