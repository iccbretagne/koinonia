import Link from "next/link";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCareAccess,
  listAppointmentRequests,
  listMsdpFollowUps,
  resolveRequestReaderAccess,
  projectRequest,
  getCareSettings,
  isUnassignedDue,
  isUnscheduledDue,
} from "@/modules/care";
import CareTabs from "./CareTabs";
import PublicFormBanner from "@/components/PublicFormBanner";

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

  const [allRequests, allFollowUps, church] = await Promise.all([
    listAppointmentRequests(churchId, ["PENDING", "VALIDATED", "SCHEDULED", "CLOSED", "REJECTED"]),
    listMsdpFollowUps(churchId),
    prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }),
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

  const delays = await getCareSettings(churchId);
  const now = new Date();
  const unassignedCount = requests.filter(
    (r) => access.canQualify && isUnassignedDue(r, delays, now)
  ).length;
  const unscheduledCount = requests.filter((r) => {
    const isOwn = (r.assignedTo && access.ownProfileIds.includes(r.assignedTo.id)) || r.assignedMemberId === access.userId;
    return (access.canQualify || isOwn) && isUnscheduledDue(r, delays, now);
  }).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Suivi pastoral</h1>
        <div className="flex items-center gap-3 shrink-0">
          {access.canOverview && (
            <Link href="/care/stats" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
              Statistiques
            </Link>
          )}
          {access.canQualify && (
            <Link href="/care/parametres" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
              Paramètres
            </Link>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Demandes de rendez-vous pastoral et suivi des nouveaux convertis.
      </p>
      {church?.slug && (
        <div className="mb-4">
          <PublicFormBanner
            slug={church.slug}
            label="Lien public — formulaire d'accueil (dont appel au salut)"
          />
        </div>
      )}
      {(unassignedCount > 0 || unscheduledCount > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-4 text-sm text-orange-800">
          À relancer :
          {unassignedCount > 0 && <> {unassignedCount} demande{unassignedCount > 1 ? "s" : ""} non confiée{unassignedCount > 1 ? "s" : ""}</>}
          {unassignedCount > 0 && unscheduledCount > 0 && " · "}
          {unscheduledCount > 0 && <> {unscheduledCount} demande{unscheduledCount > 1 ? "s" : ""} sans date fixée</>}
        </div>
      )}
      <CareTabs
        churchId={churchId}
        canQualify={access.canQualify}
        requests={projectedRequests}
        followUps={followUps}
      />
    </div>
  );
}
