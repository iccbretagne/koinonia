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
  careQueueCounts,
} from "@/modules/care";
import CareTabs from "./CareTabs";
import PublicFormBanner from "@/components/PublicFormBanner";
import { BarChart3, Settings } from "lucide-react";
import { Alert, PageHeader, buttonClasses } from "@/components/ui";
import { paths } from "@/lib/paths";

/**
 * Espace « Suivi pastoral » (spec 052) — deux onglets : Rendez-vous (ex-`/agenda/requests`,
 * qualification) et Nouveaux convertis (suivis MSDP). Un accompagnant sans `care:qualify`/
 * `care:view` n'y voit que ses propres demandes/suivis en charge.
 */
export default async function CarePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  const access = await getCareAccess(session, churchId);
  if (!access.canOverview && access.ownProfileIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-ink-muted">
        <p className="text-lg">Aucun accès à l&apos;espace suivi pastoral.</p>
      </div>
    );
  }

  const [allRequests, allFollowUps, church, queue] = await Promise.all([
    listAppointmentRequests(churchId, ["PENDING", "VALIDATED", "SCHEDULED", "CLOSED", "REJECTED"]),
    listMsdpFollowUps(churchId),
    prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }),
    // Pastilles des onglets : même compte que la carte « À traiter » de l'Accueil (spec 092).
    careQueueCounts(access, churchId),
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
  // Suivis de nouveaux convertis : non confiés (référents) et confiés sans premier contact.
  const unassignedFollowUpCount = followUps.filter(
    (f) => access.canQualify && isUnassignedDue(f, delays, now)
  ).length;
  const uncontactedCount = followUps.filter((f) => {
    const isOwn =
      f.assignedConseillerMsdpId === access.userId ||
      (f.assignedProfile && access.ownProfileIds.includes(f.assignedProfile.id));
    return (access.canQualify || isOwn) && isUnscheduledDue(f, delays, now);
  }).length;
  const relances = [
    unassignedCount > 0 && `${unassignedCount} demande${unassignedCount > 1 ? "s" : ""} de RDV non confiée${unassignedCount > 1 ? "s" : ""}`,
    unscheduledCount > 0 && `${unscheduledCount} RDV sans date fixée`,
    unassignedFollowUpCount > 0 && `${unassignedFollowUpCount} suivi${unassignedFollowUpCount > 1 ? "s" : ""} non confié${unassignedFollowUpCount > 1 ? "s" : ""}`,
    uncontactedCount > 0 && `${uncontactedCount} suivi${uncontactedCount > 1 ? "s" : ""} sans premier contact`,
  ].filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        className="mb-4"
        title="Suivi pastoral"
        description="Demandes de rendez-vous pastoral et suivi des nouveaux convertis."
        actions={
          (access.canOverview || access.canQualify) && (
            <>
              {access.canOverview && (
                <Link href={paths.care.stats()} className={buttonClasses("ghost", "sm")}>
                  <BarChart3 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Statistiques
                </Link>
              )}
              {access.canQualify && (
                <Link href={paths.care.parametres()} className={buttonClasses("ghost", "sm")}>
                  <Settings aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Paramètres
                </Link>
              )}
            </>
          )
        }
      />
      {church?.slug && (
        <div className="mb-4">
          <PublicFormBanner
            path={`/agenda-public/${church.slug}`}
            label="Lien public — demande de rendez-vous pastoral"
          />
        </div>
      )}
      {relances.length > 0 && (
        <Alert tone="warning" title="À relancer" className="mb-4">
          {relances.join(" · ")}
        </Alert>
      )}
      <CareTabs
        churchId={churchId}
        canQualify={access.canQualify}
        counts={queue ?? { requests: 0, followUps: 0 }}
        requests={projectedRequests}
        followUps={followUps}
      />
    </div>
  );
}
