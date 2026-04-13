import type { Prisma } from "@/generated/prisma/client";
import { planningBus } from "../bus";

export interface ExecutionResult {
  success: boolean;
  error?: string;
  /** ID de la ressource créée ou modifiée (event, role…), si applicable. */
  resourceId?: string;
  recurrenceTruncated?: boolean;
  maxOccurrences?: number;
  /** Nombre d'occurrences enfants créées (AJOUT_EVENEMENT récurrent uniquement). */
  childCount?: number;
}

type TxClient = Prisma.TransactionClient;

/**
 * Exécute l'action associée à une demande approuvée.
 *
 * Doit être appelé dans une transaction Prisma.
 * En cas de succès émet les événements planningBus correspondants.
 * Retourne `{ success: false, error }` sans throw — l'appelant gère ERREUR vs EXECUTEE.
 */
export async function executeRequest(
  tx: TxClient,
  requestId: string,
  churchId: string,
  type: string,
  payload: Record<string, unknown>,
  userId: string
): Promise<ExecutionResult> {
  const ctx = { tx, churchId, userId };

  try {
    let result: ExecutionResult;

    switch (type) {
      case "AJOUT_EVENEMENT":
        result = await executeAjoutEvenement(tx, churchId, payload);
        break;
      case "MODIFICATION_EVENEMENT":
        result = await executeModificationEvenement(tx, churchId, payload);
        break;
      case "ANNULATION_EVENEMENT":
        result = await executeAnnulationEvenement(tx, churchId, payload);
        break;
      case "MODIFICATION_PLANNING":
        result = await executeModificationPlanning(tx, churchId, payload);
        break;
      case "DEMANDE_ACCES":
        result = await executeDemandeAcces(tx, churchId, payload);
        break;
      default:
        return { success: false, error: `Type de demande non exécutable : ${type}` };
    }

    if (!result.success) return result;

    // Événements spécifiques par type
    if (type === "AJOUT_EVENEMENT" && result.resourceId) {
      await planningBus.emit("planning:event:created", ctx, {
        eventId: result.resourceId,
        churchId,
        title: payload.eventTitle as string,
        type: payload.eventType as string,
        createdById: userId,
        isRecurrenceParent: !!(payload.recurrenceRule && payload.recurrenceEnd),
        childCount: result.childCount,
      });
    }

    if (type === "ANNULATION_EVENEMENT" && result.resourceId) {
      await planningBus.emit("planning:event:cancelled", ctx, {
        eventId: result.resourceId,
        churchId,
        cancelledById: userId,
        requestId,
      });
    }

    // Événement générique — émis pour toute exécution réussie
    await planningBus.emit("planning:request:executed", ctx, {
      requestId,
      requestType: type,
      churchId,
      executedById: userId,
      resourceId: result.resourceId,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, error: message };
  }
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

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

const MAX_RECURRENCE_OCCURRENCES = 104; // ~2 ans hebdomadaires

function generateRecurrenceDates(
  startDate: Date,
  rule: string,
  endDate: Date
): { dates: Date[]; truncated: boolean } {
  if (isNaN(endDate.getTime())) return { dates: [], truncated: false };
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (dates.length < MAX_RECURRENCE_OCCURRENCES) {
    if (rule === "weekly") current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;
    if (current > endDate) break;
    dates.push(new Date(current));
  }
  const truncated = dates.length === MAX_RECURRENCE_OCCURRENCES && current <= endDate;
  return { dates, truncated };
}

// ─── Exécuteurs par type ──────────────────────────────────────────────────────

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

  const eventDate = new Date(date);
  if (isNaN(eventDate.getTime())) {
    return { success: false, error: "eventDate invalide" };
  }

  if (recurrenceEnd && isNaN(new Date(recurrenceEnd).getTime())) {
    return { success: false, error: "recurrenceEnd invalide" };
  }

  if (departmentIds && departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
  }

  const useOffset = !!deadlineOffset && !planningDeadlineRaw;
  const deadline = useOffset
    ? computeDeadlineFromOffset(eventDate, deadlineOffset!)
    : planningDeadlineRaw
      ? new Date(planningDeadlineRaw)
      : null;

  if (recurrenceRule && recurrenceEnd) {
    const endDate = new Date(recurrenceEnd);
    const { dates: childDates, truncated } = generateRecurrenceDates(eventDate, recurrenceRule, endDate);

    const parent = await tx.event.create({
      data: { title, type, date: eventDate, churchId, planningDeadline: deadline, recurrenceRule, isRecurrenceParent: true },
    });

    if (departmentIds && departmentIds.length > 0) {
      await tx.eventDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ eventId: parent.id, departmentId })),
      });
    }

    for (const childDate of childDates) {
      const childDeadline = useOffset ? computeDeadlineFromOffset(childDate, deadlineOffset!) : deadline;
      const child = await tx.event.create({
        data: { title, type, date: childDate, churchId, planningDeadline: childDeadline, recurrenceRule, seriesId: parent.id },
      });
      if (departmentIds && departmentIds.length > 0) {
        await tx.eventDepartment.createMany({
          data: departmentIds.map((departmentId) => ({ eventId: child.id, departmentId })),
        });
      }
    }

    return {
      success: true,
      resourceId: parent.id,
      childCount: childDates.length,
      ...(truncated ? { recurrenceTruncated: true, maxOccurrences: MAX_RECURRENCE_OCCURRENCES } : {}),
    };
  }

  const event = await tx.event.create({
    data: { title, type, date: eventDate, churchId, planningDeadline: deadline },
  });

  if (departmentIds && departmentIds.length > 0) {
    await tx.eventDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ eventId: event.id, departmentId })),
    });
  }

  return { success: true, resourceId: event.id };
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
  if (!event) return { success: false, error: "Événement introuvable" };
  if (event.churchId !== churchId) return { success: false, error: "Événement hors périmètre" };

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

  return { success: true, resourceId: eventId };
}

async function executeAnnulationEvenement(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;

  if (!eventId) return { success: false, error: "Données manquantes : eventId" };

  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { eventDepts: { select: { id: true } } },
  });
  if (!event) return { success: false, error: "Événement introuvable" };
  if (event.churchId !== churchId) return { success: false, error: "Événement hors périmètre" };

  const edIds = event.eventDepts.map((ed) => ed.id);
  if (edIds.length > 0) {
    await tx.planning.deleteMany({ where: { eventDepartmentId: { in: edIds } } });
    await tx.taskAssignment.deleteMany({ where: { eventId } });
    await tx.eventDepartment.deleteMany({ where: { id: { in: edIds } } });
  }
  await tx.event.delete({ where: { id: eventId } });

  return { success: true, resourceId: eventId };
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
  if (!event) return { success: false, error: "Événement introuvable" };
  if (event.churchId !== churchId) return { success: false, error: "Événement hors périmètre" };

  if (departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
  }

  const currentEventDepts = await tx.eventDepartment.findMany({
    where: { eventId },
    select: { id: true, departmentId: true },
  });

  const currentDeptIds = currentEventDepts.map((ed) => ed.departmentId);
  const toAdd = departmentIds.filter((id) => !currentDeptIds.includes(id));
  const toRemove = currentEventDepts.filter((ed) => !departmentIds.includes(ed.departmentId));

  if (toRemove.length > 0) {
    const removeIds = toRemove.map((ed) => ed.id);
    await tx.planning.deleteMany({ where: { eventDepartmentId: { in: removeIds } } });
    await tx.eventDepartment.deleteMany({ where: { id: { in: removeIds } } });
  }

  if (toAdd.length > 0) {
    await tx.eventDepartment.createMany({
      data: toAdd.map((departmentId) => ({ eventId, departmentId })),
    });
  }

  return { success: true, resourceId: eventId };
}

const DEMANDE_ACCES_ALLOWED_ROLES = [
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
] as const;

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

  if (!DEMANDE_ACCES_ALLOWED_ROLES.includes(role as typeof DEMANDE_ACCES_ALLOWED_ROLES[number])) {
    return { success: false, error: `Rôle non autorisé via demande d'accès : ${role}` };
  }

  if (role === "MINISTER" && !ministryId) {
    return { success: false, error: "ministryId requis pour le rôle MINISTER" };
  }
  if (role === "DEPARTMENT_HEAD" && (!departmentIds || departmentIds.length === 0)) {
    return { success: false, error: "departmentIds requis pour le rôle DEPARTMENT_HEAD" };
  }

  const user = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!user) return { success: false, error: "Utilisateur cible introuvable" };

  if (ministryId) {
    const validMinistry = await tx.ministry.count({ where: { id: ministryId, churchId } });
    if (validMinistry === 0) return { success: false, error: "Ministère invalide ou hors périmètre" };
  }

  if (departmentIds && departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
  }

  const ucr = await tx.userChurchRole.create({
    data: {
      userId: targetUserId,
      churchId,
      role: role as "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER",
      ...(role === "MINISTER" && ministryId ? { ministryId } : {}),
      ...(role === "DEPARTMENT_HEAD" && departmentIds?.length
        ? { departments: { create: departmentIds.map((departmentId) => ({ departmentId })) } }
        : {}),
    },
    select: { id: true },
  });

  return { success: true, resourceId: ucr.id };
}
