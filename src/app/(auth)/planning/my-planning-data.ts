import { prisma } from "@/lib/prisma";
import { listTeamEventsForMember, PLANNED_STATUSES, resolveWithdrawalRecipients, withdrawable } from "@/modules/planning";

/**
 * Données de « Mon planning » (`/planning`) : fiche STAR liée au compte dans l'église, services
 * (en service, en service + debrief ou remplaçant), tâches, ouverture/fermeture, événements
 * d'équipe, et désistements en attente de remplacement (spec 061). Chaque service indique s'il est
 * encore `withdrawable` ; au-delà de l'échéance, les coordonnées des responsables à joindre.
 * Extrait de la page pour que l'accueil « Aujourd'hui » (`/accueil`) lise exactement les mêmes
 * données, avec le même périmètre (la fiche liée à l'utilisateur, dans l'église courante).
 *
 * `null` : aucun compte STAR lié dans cette église. Le contrôle de permission (`planning:view`)
 * reste à l'appelant, avant l'appel.
 */
export async function loadMyPlanning(userId: string, churchId: string) {
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId, churchId } },
    select: { memberId: true, member: { select: { firstName: true, lastName: true } } },
  });

  if (!link) return null;

  const [plannings, taskAssignments, openingClosingAssignments, teamEvents, withdrawals] = await Promise.all([
    prisma.planning.findMany({
      where: {
        memberId: link.memberId,
        status: { in: [...PLANNED_STATUSES] },
      },
      include: {
        eventDepartment: {
          include: {
            event: { select: { id: true, title: true, type: true, date: true, planningDeadline: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { eventDepartment: { event: { date: "asc" } } },
    }),
    prisma.taskAssignment.findMany({
      where: { memberId: link.memberId },
      select: { eventId: true, task: { select: { name: true, departmentId: true } } },
    }),
    prisma.openingClosingAssignment.findMany({
      where: { memberId: link.memberId },
      include: { event: { select: { id: true, title: true, type: true, date: true } } },
      orderBy: { event: { date: "asc" } },
    }),
    listTeamEventsForMember(churchId, link.memberId),
    prisma.serviceWithdrawal.findMany({
      where: { memberId: link.memberId, status: "PENDING" },
      select: {
        id: true,
        originalStatus: true,
        event: { select: { id: true, title: true, type: true, date: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { event: { date: "asc" } },
    }),
  ]);

  const now = new Date();
  const servicePlannings = plannings.map(({ eventDepartment: { event, ...ed }, ...p }) => {
    const { planningDeadline, ...eventFields } = event;
    return {
      ...p,
      eventDepartment: { ...ed, event: eventFields },
      withdrawable: withdrawable({ date: event.date, planningDeadline }, now),
    };
  });
  const contactsByDepartment = await loadLeaderContacts(
    churchId,
    link.memberId,
    servicePlannings
      .filter((p) => !p.withdrawable && p.eventDepartment.event.date >= now)
      .map((p) => p.eventDepartment.department.id)
  );

  // Service d'ouverture/fermeture (spec 041) — pas de département propre, représenté comme une
  // entrée de planning synthétique pour réutiliser l'affichage existant de `MyPlanningView`.
  const openingClosingEntries = openingClosingAssignments.map((a) => ({
    id: `opening-closing-${a.id}`,
    status: "EN_SERVICE" as const,
    // Pas un service de département : pas de désistement en ligne.
    withdrawable: false,
    eventDepartment: {
      event: a.event,
      department: {
        id: "opening-closing",
        name: a.slot === "OPENING" ? "Ouverture de l'église" : "Fermeture de l'église",
      },
    },
  }));

  // Map eventId_departmentId → task names (clé composite pour éviter les croisements)
  const tasksByEvent = new Map<string, string[]>();
  for (const ta of taskAssignments) {
    const key = `${ta.eventId}_${ta.task.departmentId}`;
    const arr = tasksByEvent.get(key) ?? [];
    arr.push(ta.task.name);
    tasksByEvent.set(key, arr);
  }

  return {
    member: link.member,
    plannings: [...servicePlannings, ...openingClosingEntries],
    tasksByEvent: Object.fromEntries(tasksByEvent),
    teamEvents,
    withdrawals,
    contactsByDepartment,
  };
}

export interface LeaderContact {
  name: string;
  email: string;
  phone: string | null;
}

/** Responsables à joindre directement, par département, une fois la date limite passée (spec 061). */
async function loadLeaderContacts(
  churchId: string,
  memberId: string,
  departmentIds: string[]
): Promise<Record<string, LeaderContact[]>> {
  const result: Record<string, LeaderContact[]> = {};
  for (const departmentId of new Set(departmentIds)) {
    const userIds = await resolveWithdrawalRecipients(churchId, departmentId, memberId, prisma);
    if (userIds.length === 0) continue;
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        email: true,
        name: true,
        displayName: true,
        memberLinks: { where: { churchId }, select: { member: { select: { phone: true } } } },
      },
    });
    result[departmentId] = users.map((u) => ({
      name: u.displayName ?? u.name ?? u.email,
      email: u.email,
      phone: u.memberLinks[0]?.member.phone ?? null,
    }));
  }
  return result;
}

export type MyPlanningData = NonNullable<Awaited<ReturnType<typeof loadMyPlanning>>>;
