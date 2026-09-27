import { prisma } from "@/lib/prisma";
import { listTeamEventsForMember } from "@/modules/planning";

/**
 * Données de « Mon planning » (`/planning`) : fiche STAR liée au compte dans l'église, services
 * (en service ou en service + debrief), tâches, ouverture/fermeture et événements d'équipe.
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

  const [plannings, taskAssignments, openingClosingAssignments, teamEvents] = await Promise.all([
    prisma.planning.findMany({
      where: {
        memberId: link.memberId,
        status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
      },
      include: {
        eventDepartment: {
          include: {
            event: { select: { id: true, title: true, type: true, date: true } },
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
  ]);

  // Service d'ouverture/fermeture (spec 041) — pas de département propre, représenté comme une
  // entrée de planning synthétique pour réutiliser l'affichage existant de `MyPlanningView`.
  const openingClosingEntries = openingClosingAssignments.map((a) => ({
    id: `opening-closing-${a.id}`,
    status: "EN_SERVICE" as const,
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
    plannings: [...plannings, ...openingClosingEntries],
    tasksByEvent: Object.fromEntries(tasksByEvent),
    teamEvents,
  };
}

export type MyPlanningData = NonNullable<Awaited<ReturnType<typeof loadMyPlanning>>>;
