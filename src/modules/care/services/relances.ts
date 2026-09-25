import { prisma } from "@/lib/prisma";
import { notifyDeptMembers } from "@/lib/notifications";
import { DEPT_FN } from "@/lib/department-functions";
import { DEFAULT_CARE_SETTINGS, type CareDelays } from "./settings";

/**
 * Relances de l'espace suivi pastoral (spec 052, T60), pour les deux sortes de demandes :
 * - non confiée (RDV `PENDING`, suivi `SUBMITTED`) → référents ;
 * - confiée sans suite (RDV `VALIDATED` sans date fixée, suivi `ASSIGNED` sans premier contact)
 *   → l'accompagnant : le membre du MSDP, ou pour un RDV confié à un profil pastoral le protocole
 *   qui le planifie (T19) ; pour un suivi confié à un profil pastoral, son compte s'il en a un.
 * Délais réglables par église (`CareSettings`, T59). Les fonctions d'échéance sont pures, sur le
 * modèle de `relanceDueAt`/`isRelanceDue` (spec 051).
 */

/** États « reçue, non confiée » : RDV et suivi de nouveau converti. */
const UNASSIGNED_STATUSES = new Set(["PENDING", "SUBMITTED"]);
/** États « confiée, sans suite » : RDV sans date, suivi sans premier contact. */
const UNSCHEDULED_STATUSES = new Set(["VALIDATED", "ASSIGNED"]);

export function unassignedDueAt(
  request: { status: string; createdAt: Date },
  delays: CareDelays
): Date | null {
  if (!UNASSIGNED_STATUSES.has(request.status)) return null;
  return new Date(request.createdAt.getTime() + delays.unassignedDelayDays * 86_400_000);
}

export function isUnassignedDue(
  request: { status: string; createdAt: Date },
  delays: CareDelays,
  now: Date
): boolean {
  const due = unassignedDueAt(request, delays);
  return due !== null && due.getTime() <= now.getTime();
}

export function unscheduledDueAt(
  request: { status: string; assignedAt: Date | null },
  delays: CareDelays
): Date | null {
  if (!UNSCHEDULED_STATUSES.has(request.status) || !request.assignedAt) return null;
  return new Date(request.assignedAt.getTime() + delays.unscheduledDelayDays * 86_400_000);
}

export function isUnscheduledDue(
  request: { status: string; assignedAt: Date | null },
  delays: CareDelays,
  now: Date
): boolean {
  const due = unscheduledDueAt(request, delays);
  return due !== null && due.getTime() <= now.getTime();
}

const RELANCE_TYPE_UNASSIGNED = "CARE_RELANCE_UNASSIGNED";
const RELANCE_TYPE_UNSCHEDULED = "CARE_RELANCE_UNSCHEDULED";

/** Demande de RDV ou suivi, ramené à ce dont la relance a besoin. */
interface RelanceItem {
  kind: "requests" | "followups";
  id: string;
  churchId: string;
  status: string;
  personName: string;
  createdAt: Date;
  assignedAt: Date | null;
  /** Membre du MSDP en charge (compte). */
  memberUserId: string | null;
  /** Profil pastoral en charge : `userId` = son compte éventuel. */
  profile: { userId: string | null } | null;
}

function linkOf(item: RelanceItem): string {
  return `/care/${item.kind}/${item.id}`;
}

export async function runCareRelances(): Promise<{
  unassignedNotified: number;
  unscheduledNotified: number;
}> {
  const now = new Date();

  const [pendingRequests, validatedRequests, submittedFollowUps, assignedFollowUps] = await Promise.all([
    prisma.appointmentRequest.findMany({
      where: { status: "PENDING" },
      select: { id: true, churchId: true, status: true, firstName: true, lastName: true, createdAt: true },
    }),
    prisma.appointmentRequest.findMany({
      where: { status: "VALIDATED", scheduledFor: null, assignedAt: { not: null } },
      select: {
        id: true,
        churchId: true,
        status: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        assignedAt: true,
        assignedMemberId: true,
        assignedTo: { select: { userId: true } },
      },
    }),
    prisma.msdpFollowUp.findMany({
      where: { status: "SUBMITTED" },
      select: {
        id: true,
        churchId: true,
        status: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        request: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.msdpFollowUp.findMany({
      where: { status: "ASSIGNED", assignedAt: { not: null } },
      select: {
        id: true,
        churchId: true,
        status: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        assignedAt: true,
        assignedConseillerMsdpId: true,
        assignedProfile: { select: { userId: true } },
        request: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const followUpName = (f: {
    firstName: string | null;
    lastName: string | null;
    request: { firstName: string; lastName: string } | null;
  }) => `${f.firstName ?? f.request?.firstName ?? ""} ${f.lastName ?? f.request?.lastName ?? ""}`.trim();

  const unassignedItems: RelanceItem[] = [
    ...pendingRequests.map((r) => ({
      kind: "requests" as const,
      id: r.id,
      churchId: r.churchId,
      status: r.status,
      personName: `${r.firstName} ${r.lastName}`,
      createdAt: r.createdAt,
      assignedAt: null,
      memberUserId: null,
      profile: null,
    })),
    ...submittedFollowUps.map((f) => ({
      kind: "followups" as const,
      id: f.id,
      churchId: f.churchId,
      status: f.status,
      personName: followUpName(f),
      createdAt: f.createdAt,
      assignedAt: null,
      memberUserId: null,
      profile: null,
    })),
  ];
  const unscheduledItems: RelanceItem[] = [
    ...validatedRequests.map((r) => ({
      kind: "requests" as const,
      id: r.id,
      churchId: r.churchId,
      status: r.status,
      personName: `${r.firstName} ${r.lastName}`,
      createdAt: r.createdAt,
      assignedAt: r.assignedAt,
      memberUserId: r.assignedMemberId,
      profile: r.assignedTo,
    })),
    ...assignedFollowUps.map((f) => ({
      kind: "followups" as const,
      id: f.id,
      churchId: f.churchId,
      status: f.status,
      personName: followUpName(f),
      createdAt: f.createdAt,
      assignedAt: f.assignedAt,
      memberUserId: f.assignedConseillerMsdpId,
      profile: f.assignedProfile,
    })),
  ];

  if (unassignedItems.length === 0 && unscheduledItems.length === 0) {
    return { unassignedNotified: 0, unscheduledNotified: 0 };
  }

  const churchIds = Array.from(new Set([...unassignedItems, ...unscheduledItems].map((r) => r.churchId)));
  const settingsRows = await prisma.careSettings.findMany({
    where: { churchId: { in: churchIds } },
    select: { churchId: true, unassignedDelayDays: true, unscheduledDelayDays: true },
  });
  const settingsByChurch = new Map(settingsRows.map((s) => [s.churchId, s]));
  const delaysFor = (churchId: string): CareDelays =>
    settingsByChurch.get(churchId) ?? DEFAULT_CARE_SETTINGS;

  const dueUnassigned = unassignedItems.filter((r) => isUnassignedDue(r, delaysFor(r.churchId), now));
  const dueUnscheduled = unscheduledItems.filter((r) => isUnscheduledDue(r, delaysFor(r.churchId), now));

  const relevantLinks = [...dueUnassigned, ...dueUnscheduled].map(linkOf);
  const existingNotifs = relevantLinks.length
    ? await prisma.notification.findMany({
        where: {
          type: { in: [RELANCE_TYPE_UNASSIGNED, RELANCE_TYPE_UNSCHEDULED] },
          link: { in: relevantLinks },
        },
        select: { link: true, type: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const lastNotifiedAt = new Map<string, Date>();
  for (const n of existingNotifs) {
    const key = `${n.type}:${n.link}`;
    if (!lastNotifiedAt.has(key)) lastNotifiedAt.set(key, n.createdAt); // le plus récent d'abord
  }
  function shouldNotify(type: string, link: string, delayDays: number): boolean {
    const last = lastNotifiedAt.get(`${type}:${link}`);
    return !last || now.getTime() - last.getTime() >= delayDays * 86_400_000;
  }

  let unassignedNotified = 0;
  const byChurch = new Map<string, RelanceItem[]>();
  for (const r of dueUnassigned) {
    if (!shouldNotify(RELANCE_TYPE_UNASSIGNED, linkOf(r), delaysFor(r.churchId).unassignedDelayDays)) continue;
    if (!byChurch.has(r.churchId)) byChurch.set(r.churchId, []);
    byChurch.get(r.churchId)!.push(r);
  }
  for (const [churchId, items] of byChurch) {
    const referents = await prisma.userChurchRole.findMany({
      where: { churchId, role: { in: ["SUPER_ADMIN", "ADMIN", "PASTORAL_CARE_REFERENT"] } },
      select: { userId: true },
    });
    const userIds = Array.from(new Set(referents.map((r) => r.userId)));
    if (userIds.length === 0) continue;
    for (const r of items) {
      const isRequest = r.kind === "requests";
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          domain: "care",
          type: RELANCE_TYPE_UNASSIGNED,
          title: isRequest ? "Demande de RDV pastoral à confier" : "Suivi de nouveau converti à confier",
          message: `${r.personName} — en attente depuis le ${r.createdAt.toLocaleDateString("fr-FR")}.`,
          link: linkOf(r),
        })),
        skipDuplicates: true,
      });
      unassignedNotified++;
    }
  }

  let unscheduledNotified = 0;
  for (const r of dueUnscheduled) {
    const link = linkOf(r);
    if (!shouldNotify(RELANCE_TYPE_UNSCHEDULED, link, delaysFor(r.churchId).unscheduledDelayDays)) continue;
    const isRequest = r.kind === "requests";
    const notification = {
      domain: "care",
      type: RELANCE_TYPE_UNSCHEDULED,
      title: isRequest ? "Rendez-vous pastoral à planifier" : "Suivi de nouveau converti sans premier contact",
      message: `${r.personName} — confié le ${r.assignedAt!.toLocaleDateString("fr-FR")}, ${
        isRequest ? "toujours sans date" : "toujours sans premier contact"
      }.`,
      link,
    };
    // Qui relancer : le membre du MSDP en charge ; pour un RDV confié à un profil pastoral, le
    // protocole qui le planifie ; pour un suivi confié à un profil pastoral, son compte s'il en a un.
    const recipientUserId = r.memberUserId ?? (!isRequest ? r.profile?.userId ?? null : null);
    if (recipientUserId) {
      await prisma.notification
        .create({ data: { userId: recipientUserId, ...notification } })
        .catch(() => {});
      unscheduledNotified++;
    } else if (isRequest && r.profile) {
      await notifyDeptMembers(r.churchId, DEPT_FN.PROTOCOLE, notification).catch(() => {});
      unscheduledNotified++;
    }
  }

  return { unassignedNotified, unscheduledNotified };
}
