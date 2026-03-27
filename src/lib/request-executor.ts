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
        return await executeModificationEvenement(tx, churchId, payload);

      case "ANNULATION_EVENEMENT":
        return await executeAnnulationEvenement(tx, churchId, payload);

      case "MODIFICATION_PLANNING":
        return await executeModificationPlanning(tx, churchId, payload);

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

function computeDeadlineFromOffset(eventDate: Date, offset: string): Date {
  const result = new Date(eventDate);
  const match = offset.match(/^(\d+)(h|d)$/);
  if (!match) return result;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "h") result.setHours(result.getHours() - value);
  else if (unit === "d") result.setDate(result.getDate() - value);
  return result;
}

function generateRecurrenceDates(startDate: Date, rule: string, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (true) {
    if (rule === "weekly") current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;
    if (current > endDate) break;
    dates.push(new Date(current));
  }
  return dates;
}

async function executeAjoutEvenement(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const title = payload.eventTitle as string;
  const type = payload.eventType as string;
  const date = payload.eventDate as string;
  const planningDeadlineRaw = payload.planningDeadline as string | null | undefined;
  const deadlineOffset = payload.deadlineOffset as string | null | undefined;
  const departmentIds = payload.departmentIds as string[] | undefined;
  const recurrenceRule = payload.recurrenceRule as string | null | undefined;
  const recurrenceEnd = payload.recurrenceEnd as string | null | undefined;

  if (!title || !type || !date) {
    return { success: false, error: "Données manquantes : eventTitle, eventType, eventDate" };
  }

  if (departmentIds && departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
  }

  const eventDate = new Date(date);
  const useOffset = !!deadlineOffset && !planningDeadlineRaw;
  const deadline = useOffset
    ? computeDeadlineFromOffset(eventDate, deadlineOffset!)
    : planningDeadlineRaw
      ? new Date(planningDeadlineRaw)
      : null;

  if (recurrenceRule && recurrenceEnd) {
    const endDate = new Date(recurrenceEnd);
    const childDates = generateRecurrenceDates(eventDate, recurrenceRule, endDate);

    const parent = await tx.event.create({
      data: {
        title,
        type,
        date: eventDate,
        churchId,
        planningDeadline: deadline,
        recurrenceRule,
        isRecurrenceParent: true,
      },
    });

    if (departmentIds && departmentIds.length > 0) {
      await tx.eventDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ eventId: parent.id, departmentId })),
      });
    }

    for (const childDate of childDates) {
      const childDeadline = useOffset
        ? computeDeadlineFromOffset(childDate, deadlineOffset!)
        : deadline;

      const child = await tx.event.create({
        data: {
          title,
          type,
          date: childDate,
          churchId,
          planningDeadline: childDeadline,
          recurrenceRule,
          seriesId: parent.id,
        },
      });

      if (departmentIds && departmentIds.length > 0) {
        await tx.eventDepartment.createMany({
          data: departmentIds.map((departmentId) => ({ eventId: child.id, departmentId })),
        });
      }
    }

    return { success: true };
  }

  const event = await tx.event.create({
    data: {
      title,
      type,
      date: eventDate,
      churchId,
      planningDeadline: deadline,
    },
  });

  if (departmentIds && departmentIds.length > 0) {
    await tx.eventDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ eventId: event.id, departmentId })),
    });
  }

  return { success: true };
}

async function executeModificationEvenement(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;
  const changes = payload.changes as Record<string, unknown> | undefined;

  if (!eventId || !changes) {
    return { success: false, error: "Données manquantes : eventId, changes" };
  }

  const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, churchId: true } });
  if (!event) {
    return { success: false, error: "Événement introuvable" };
  }
  if (event.churchId !== churchId) {
    return { success: false, error: "Événement hors périmètre" };
  }

  await tx.event.update({
    where: { id: eventId },
    data: {
      ...(changes.title ? { title: changes.title as string } : {}),
      ...(changes.type ? { type: changes.type as string } : {}),
      ...(changes.date ? { date: new Date(changes.date as string) } : {}),
      ...("planningDeadline" in changes
        ? { planningDeadline: changes.planningDeadline ? new Date(changes.planningDeadline as string) : null }
        : {}),
    },
  });

  return { success: true };
}

async function executeAnnulationEvenement(
  tx: TxClient,
  churchId: string,
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
  if (event.churchId !== churchId) {
    return { success: false, error: "Événement hors périmètre" };
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
  churchId: string,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;
  const departmentIds = payload.departmentIds as string[] | undefined;

  if (!eventId || !Array.isArray(departmentIds)) {
    return { success: false, error: "Données manquantes : eventId, departmentIds" };
  }

  const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, churchId: true } });
  if (!event) {
    return { success: false, error: "Événement introuvable" };
  }
  if (event.churchId !== churchId) {
    return { success: false, error: "Événement hors périmètre" };
  }

  if (departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
  }

  // Fetch current EventDepartment records for this event
  const currentEventDepts = await tx.eventDepartment.findMany({
    where: { eventId },
    select: { id: true, departmentId: true },
  });

  const currentDeptIds = currentEventDepts.map((ed) => ed.departmentId);
  const requestedDeptIds = departmentIds;

  // Departments to add: in requested but not in current
  const toAdd = requestedDeptIds.filter((id) => !currentDeptIds.includes(id));

  // Departments to remove: in current but not in requested
  const toRemove = currentEventDepts.filter((ed) => !requestedDeptIds.includes(ed.departmentId));

  // Remove departments: cascade delete plannings first, then EventDepartment records
  if (toRemove.length > 0) {
    const removeIds = toRemove.map((ed) => ed.id);
    await tx.planning.deleteMany({ where: { eventDepartmentId: { in: removeIds } } });
    await tx.eventDepartment.deleteMany({ where: { id: { in: removeIds } } });
  }

  // Add new departments
  if (toAdd.length > 0) {
    await tx.eventDepartment.createMany({
      data: toAdd.map((departmentId) => ({ eventId, departmentId })),
    });
  }

  return {
    success: true,
    error: undefined,
  };
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

  if (ministryId) {
    const validMinistry = await tx.ministry.count({ where: { id: ministryId, churchId } });
    if (validMinistry === 0) {
      return { success: false, error: "Ministère invalide ou hors périmètre" };
    }
  }

  if (departmentIds && departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
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
