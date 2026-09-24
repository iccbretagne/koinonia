import { prisma } from "@/lib/prisma";
import { notifyDeptMembers } from "@/lib/notifications";
import { DEPT_FN } from "@/lib/department-functions";
import { DEFAULT_CARE_SETTINGS, type CareDelays } from "./settings";

/**
 * Relances des demandes de rendez-vous pastoral (spec 052, T60) : non confiée (`PENDING`) →
 * référents ; confiée sans date fixée (`VALIDATED`, sans `scheduledFor`) → l'accompagnant
 * (le membre du MSDP qui fixe lui-même la date, ou le protocole qui planifie pour un profil
 * pastoral — T19). Délais réglables par église (`CareSettings`, T59). Les fonctions
 * d'échéance sont pures, sur le modèle de `relanceDueAt`/`isRelanceDue` (spec 051).
 */

export function unassignedDueAt(
  request: { status: string; createdAt: Date },
  delays: CareDelays
): Date | null {
  if (request.status !== "PENDING") return null;
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
  if (request.status !== "VALIDATED" || !request.assignedAt) return null;
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

export async function runCareRelances(): Promise<{
  unassignedNotified: number;
  unscheduledNotified: number;
}> {
  const now = new Date();

  const [pendingRequests, validatedRequests] = await Promise.all([
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
        assignedAt: true,
        assignedMemberId: true,
        assignedTo: { select: { userId: true } },
      },
    }),
  ]);

  if (pendingRequests.length === 0 && validatedRequests.length === 0) {
    return { unassignedNotified: 0, unscheduledNotified: 0 };
  }

  const churchIds = Array.from(
    new Set([...pendingRequests, ...validatedRequests].map((r) => r.churchId))
  );
  const settingsRows = await prisma.careSettings.findMany({
    where: { churchId: { in: churchIds } },
    select: { churchId: true, unassignedDelayDays: true, unscheduledDelayDays: true },
  });
  const settingsByChurch = new Map(settingsRows.map((s) => [s.churchId, s]));
  const delaysFor = (churchId: string): CareDelays =>
    settingsByChurch.get(churchId) ?? DEFAULT_CARE_SETTINGS;

  const dueUnassigned = pendingRequests.filter((r) => isUnassignedDue(r, delaysFor(r.churchId), now));
  const dueUnscheduled = validatedRequests.filter((r) => isUnscheduledDue(r, delaysFor(r.churchId), now));

  const relevantLinks = [
    ...dueUnassigned.map((r) => `/care/requests/${r.id}`),
    ...dueUnscheduled.map((r) => `/care/requests/${r.id}`),
  ];
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
  const byChurch = new Map<string, typeof dueUnassigned>();
  for (const r of dueUnassigned) {
    const link = `/care/requests/${r.id}`;
    if (!shouldNotify(RELANCE_TYPE_UNASSIGNED, link, delaysFor(r.churchId).unassignedDelayDays)) continue;
    if (!byChurch.has(r.churchId)) byChurch.set(r.churchId, []);
    byChurch.get(r.churchId)!.push(r);
  }
  for (const [churchId, requests] of byChurch) {
    const referents = await prisma.userChurchRole.findMany({
      where: { churchId, role: { in: ["SUPER_ADMIN", "ADMIN", "PASTORAL_CARE_REFERENT"] } },
      select: { userId: true },
    });
    const userIds = Array.from(new Set(referents.map((r) => r.userId)));
    if (userIds.length === 0) continue;
    for (const r of requests) {
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: RELANCE_TYPE_UNASSIGNED,
          title: "Demande de RDV pastoral à confier",
          message: `${r.firstName} ${r.lastName} — en attente depuis le ${r.createdAt.toLocaleDateString("fr-FR")}.`,
          link: `/care/requests/${r.id}`,
        })),
        skipDuplicates: true,
      });
      unassignedNotified++;
    }
  }

  let unscheduledNotified = 0;
  for (const r of dueUnscheduled) {
    const link = `/care/requests/${r.id}`;
    if (!shouldNotify(RELANCE_TYPE_UNSCHEDULED, link, delaysFor(r.churchId).unscheduledDelayDays)) continue;
    const personName = `${r.firstName} ${r.lastName}`;
    if (r.assignedMemberId) {
      await prisma.notification.create({
        data: {
          userId: r.assignedMemberId,
          type: RELANCE_TYPE_UNSCHEDULED,
          title: "Rendez-vous pastoral à planifier",
          message: `${personName} — confié le ${r.assignedAt!.toLocaleDateString("fr-FR")}, toujours sans date.`,
          link,
        },
      }).catch(() => {});
      unscheduledNotified++;
    } else if (r.assignedTo) {
      await notifyDeptMembers(r.churchId, DEPT_FN.PROTOCOLE, {
        type: RELANCE_TYPE_UNSCHEDULED,
        title: "Rendez-vous pastoral à planifier",
        message: `${personName} — confié le ${r.assignedAt!.toLocaleDateString("fr-FR")}, toujours sans date.`,
        link,
      }).catch(() => {});
      unscheduledNotified++;
    }
  }

  return { unassignedNotified, unscheduledNotified };
}
