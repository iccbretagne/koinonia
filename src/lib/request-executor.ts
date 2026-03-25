import type { Prisma } from "@prisma/client";

interface ExecutionResult {
  success: boolean;
  error?: string;
}

type TxClient = Prisma.TransactionClient;

/**
 * Execute the action associated with an approved request.
 * Called within a transaction after status is set to APPROUVEE.
 * On success, sets status to EXECUTEE. On failure, sets ERREUR + executionError.
 */
export async function executeRequest(
  tx: TxClient,
  _requestId: string,
  churchId: string,
  type: string,
  payload: Record<string, unknown>,
  _approvedById: string
): Promise<ExecutionResult> {
  try {
    switch (type) {
      case "AJOUT_EVENEMENT":
        return await executeAjoutEvenement(tx, churchId, payload);

      case "MODIFICATION_EVENEMENT":
        return await executeModificationEvenement(tx, payload);

      case "ANNULATION_EVENEMENT":
        return await executeAnnulationEvenement(tx, payload);

      case "MODIFICATION_PLANNING":
        return await executeModificationPlanning(tx, payload);

      case "DEMANDE_ACCES":
        return await executeDemandeAcces(tx, churchId, payload);

      default:
        return { success: false, error: `Type de demande non exécutable : ${type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, error: message };
  }
}

async function executeAjoutEvenement(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const title = payload.eventTitle as string;
  const type = payload.eventType as string;
  const date = payload.eventDate as string;
  const planningDeadline = payload.planningDeadline as string | null;

  if (!title || !type || !date) {
    return { success: false, error: "Données manquantes : eventTitle, eventType, eventDate" };
  }

  await tx.event.create({
    data: {
      title,
      type,
      date: new Date(date),
      churchId,
      planningDeadline: planningDeadline ? new Date(planningDeadline) : null,
    },
  });

  return { success: true };
}

async function executeModificationEvenement(
  tx: TxClient,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;
  const changes = payload.changes as Record<string, unknown> | undefined;

  if (!eventId || !changes) {
    return { success: false, error: "Données manquantes : eventId, changes" };
  }

  const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
    return { success: false, error: "Événement introuvable" };
  }

  await tx.event.update({
    where: { id: eventId },
    data: {
      ...(changes.title ? { title: changes.title as string } : {}),
      ...(changes.type ? { type: changes.type as string } : {}),
      ...(changes.date ? { date: new Date(changes.date as string) } : {}),
    },
  });

  return { success: true };
}

async function executeAnnulationEvenement(
  tx: TxClient,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;

  if (!eventId) {
    return { success: false, error: "Données manquantes : eventId" };
  }

  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { eventDepts: { select: { id: true } } },
  });
  if (!event) {
    return { success: false, error: "Événement introuvable" };
  }

  const edIds = event.eventDepts.map((ed) => ed.id);
  if (edIds.length > 0) {
    await tx.planning.deleteMany({ where: { eventDepartmentId: { in: edIds } } });
    await tx.taskAssignment.deleteMany({ where: { eventId } });
    await tx.eventDepartment.deleteMany({ where: { id: { in: edIds } } });
  }
  await tx.event.delete({ where: { id: eventId } });

  return { success: true };
}

async function executeModificationPlanning(
  tx: TxClient,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;
  const departmentId = payload.departmentId as string;
  const memberId = payload.memberId as string;
  const newStatus = payload.newStatus as string | null;

  if (!eventId || !departmentId || !memberId) {
    return { success: false, error: "Données manquantes : eventId, departmentId, memberId" };
  }

  const eventDept = await tx.eventDepartment.findFirst({
    where: { eventId, departmentId },
    select: { id: true },
  });

  if (!eventDept) {
    // Create the event-department link if it doesn't exist
    const created = await tx.eventDepartment.create({
      data: { eventId, departmentId },
    });
    await tx.planning.create({
      data: {
        eventDepartmentId: created.id,
        memberId,
        status: newStatus as "EN_SERVICE" | "EN_SERVICE_DEBRIEF" | "INDISPONIBLE" | "REMPLACANT" | null,
      },
    });
    return { success: true };
  }

  await tx.planning.upsert({
    where: {
      eventDepartmentId_memberId: {
        eventDepartmentId: eventDept.id,
        memberId,
      },
    },
    update: {
      status: newStatus as "EN_SERVICE" | "EN_SERVICE_DEBRIEF" | "INDISPONIBLE" | "REMPLACANT" | null,
    },
    create: {
      eventDepartmentId: eventDept.id,
      memberId,
      status: newStatus as "EN_SERVICE" | "EN_SERVICE_DEBRIEF" | "INDISPONIBLE" | "REMPLACANT" | null,
    },
  });

  return { success: true };
}

async function executeDemandeAcces(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const targetUserId = payload.targetUserId as string;
  const role = payload.role as string;
  const ministryId = payload.ministryId as string | undefined;
  const departmentIds = payload.departmentIds as string[] | undefined;

  if (!targetUserId || !role) {
    return { success: false, error: "Données manquantes : targetUserId, role" };
  }

  const user = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!user) {
    return { success: false, error: "Utilisateur cible introuvable" };
  }

  await tx.userChurchRole.create({
    data: {
      userId: targetUserId,
      churchId,
      role: role as "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER",
      ...(role === "MINISTER" && ministryId ? { ministryId } : {}),
      ...(role === "DEPARTMENT_HEAD" && departmentIds?.length
        ? {
            departments: {
              create: departmentIds.map((departmentId) => ({ departmentId })),
            },
          }
        : {}),
    },
  });

  return { success: true };
}
