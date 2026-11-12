import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

/**
 * Tâches d'un département pour un événement et affectation des STAR en service, partagées par
 * l'écran planning (`/api/events/[eventId]/departments/[deptId]/tasks`) et l'assistant IA
 * (spec 081). Les droits (permission + périmètre de départements) sont vérifiés par l'appelant ;
 * ce service porte les règles métier : département lié à l'événement, tâche du département,
 * STAR en service. Client `PrismaClient` complet : l'affectation a besoin de `$transaction`.
 */
type DbClient = PrismaClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export const SERVING_STATUSES = ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] as const;

const withAssignments = (eventId: string) => ({
  assignments: {
    where: { eventId },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
  },
});

/** Lien département ↔ événement, ou 404. */
export async function requireEventDepartment(eventId: string, departmentId: string, db?: DbClient) {
  const client = db ?? (await defaultDb());
  const eventDept = await client.eventDepartment.findUnique({
    where: { eventId_departmentId: { eventId, departmentId } },
  });
  if (!eventDept) throw new ApiError(404, "Ce département n'est pas lié à cet événement");
  return eventDept;
}

/** Tâches du département avec leurs STAR affectés pour l'événement (département non lié ⇒ 404). */
export async function listEventTasks(eventId: string, departmentId: string, db?: DbClient) {
  const client = db ?? (await defaultDb());
  await requireEventDepartment(eventId, departmentId, client);
  return client.task.findMany({
    where: { departmentId },
    include: withAssignments(eventId),
    orderBy: { createdAt: "asc" },
  });
}

/** STAR en service (En service, En service + débrief) pour ce département et cet événement. */
export async function listServingMembers(eventDepartmentId: string, db?: DbClient) {
  const client = db ?? (await defaultDb());
  return client.planning.findMany({
    where: { eventDepartmentId, status: { in: [...SERVING_STATUSES] } },
    select: { memberId: true, status: true, member: { select: { firstName: true, lastName: true } } },
    orderBy: { member: { lastName: "asc" } },
  });
}

/** Parmi `memberIds`, ceux qui ne sont pas en service pour ce département et cet événement. */
export async function findNotServing(eventDepartmentId: string, memberIds: string[], db?: DbClient): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const client = db ?? (await defaultDb());
  const plannings = await client.planning.findMany({
    where: { eventDepartmentId, memberId: { in: memberIds }, status: { in: [...SERVING_STATUSES] } },
    select: { memberId: true },
  });
  const serving = new Set(plannings.map((p) => p.memberId));
  return memberIds.filter((id) => !serving.has(id));
}

export interface TaskAssignmentInput {
  taskId: string;
  memberIds: string[];
}

/**
 * Remplace les affectations des tâches citées pour l'événement — les autres tâches ne bougent
 * pas — en une seule transaction. Tâche hors du département ⇒ 404 ; département non lié ⇒ 404 ;
 * STAR pas en service ⇒ 400. Renvoie les tâches citées avec leurs affectations, dans l'ordre cité.
 */
export async function assignEventTasks(eventId: string, departmentId: string, assignments: TaskAssignmentInput[], db?: DbClient) {
  const client = db ?? (await defaultDb());
  const taskIds = assignments.map((a) => a.taskId);

  for (const taskId of new Set(taskIds)) {
    const task = await client.task.findUnique({ where: { id: taskId } });
    if (task?.departmentId !== departmentId) throw new ApiError(404, "Tâche introuvable dans ce département");
  }

  const eventDept = await requireEventDepartment(eventId, departmentId, client);

  const memberIds = [...new Set(assignments.flatMap((a) => a.memberIds))];
  if ((await findNotServing(eventDept.id, memberIds, client)).length > 0) {
    throw new ApiError(400, "Ce STAR n'est pas en service pour cet événement");
  }

  await client.$transaction(
    assignments.flatMap(({ taskId, memberIds: ids }) => [
      client.taskAssignment.deleteMany({ where: { taskId, eventId } }),
      ...ids.map((memberId) => client.taskAssignment.create({ data: { taskId, memberId, eventId } })),
    ])
  );

  const updated = await Promise.all(
    taskIds.map((taskId) => client.task.findUnique({ where: { id: taskId }, include: withAssignments(eventId) }))
  );
  return updated.flatMap((t) => (t ? [t] : []));
}
