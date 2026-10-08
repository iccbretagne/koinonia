import type { Prisma } from "@/generated/prisma/client";
import { planningBus } from "../bus";
import { deleteEvents } from "./event.service";
import { collectEventChangeNotices, type EventChangeNotices } from "./event-change-notices";
import { recordRemovedPlannings } from "./planning-change-notices";
import { generateRecurrenceDates, MAX_RECURRENCE_OCCURRENCES } from "@/lib/recurrence";

export interface ExecutionResult {
  success: boolean;
  error?: string;
  /** ID de la ressource créée ou modifiée (event, role…), si applicable. */
  resourceId?: string;
  recurrenceTruncated?: boolean;
  /** Notifications de changement d'événement à envoyer après le commit (spec 059). */
  notices?: EventChangeNotices;
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
        result = await executeModificationEvenement(tx, churchId, payload, ctx);
        break;
      case "ANNULATION_EVENEMENT":
        // ctx + requestId passés pour émettre planning:event:cancelled AVANT la suppression
        // (les handlers doivent nettoyer les FK avant que l'event soit supprimé)
        result = await executeAnnulationEvenement(tx, churchId, payload, ctx, requestId);
        break;
      case "MODIFICATION_PLANNING":
        result = await executeModificationPlanning(tx, churchId, payload, userId);
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
  const match = /^(\d+)([hd])$/.exec(offset);
  if (!match) return result;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "h") result.setHours(result.getHours() - value);
  else if (unit === "d") result.setDate(result.getDate() - value);
  return result;
}

// ─── Exécuteurs par type ──────────────────────────────────────────────────────

/** Contrôles de forme d'une demande d'ajout d'événement ; `null` si elle est exploitable. */
function ajoutEvenementError(title: unknown, type: unknown, date: unknown, recurrenceEnd: string | null | undefined): string | null {
  if (!title || !type || !date) return "Données manquantes : eventTitle, eventType, eventDate";
  if (Number.isNaN(new Date(date as string).getTime())) return "eventDate invalide";
  if (recurrenceEnd && Number.isNaN(new Date(recurrenceEnd).getTime())) return "recurrenceEnd invalide";
  return null;
}

async function linkDepartments(tx: TxClient, eventId: string, departmentIds: string[]) {
  if (departmentIds.length === 0) return;
  await tx.eventDepartment.createMany({
    data: departmentIds.map((departmentId) => ({ eventId, departmentId })),
  });
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
  const departmentIds = (payload.departmentIds as string[] | undefined) ?? [];
  const recurrenceRule = payload.recurrenceRule as string | null | undefined;
  const recurrenceEnd = payload.recurrenceEnd as string | null | undefined;

  const error = ajoutEvenementError(title, type, date, recurrenceEnd);
  if (error) return { success: false, error };
  const eventDate = new Date(date);

  if (departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) {
      return { success: false, error: "Départements invalides ou hors périmètre" };
    }
  }

  // Un décalage (« 48h », « 3d ») s'applique à chaque occurrence ; une date fixe vaut pour toutes.
  const fixedDeadline = planningDeadlineRaw ? new Date(planningDeadlineRaw) : null;
  const deadlineFor = (d: Date) =>
    deadlineOffset && !planningDeadlineRaw ? computeDeadlineFromOffset(d, deadlineOffset) : fixedDeadline;

  if (recurrenceRule && recurrenceEnd) {
    const { dates: childDates, truncated } = generateRecurrenceDates(eventDate, recurrenceRule, new Date(recurrenceEnd));

    const parent = await tx.event.create({
      data: { title, type, date: eventDate, churchId, planningDeadline: deadlineFor(eventDate), recurrenceRule, isRecurrenceParent: true },
    });
    await linkDepartments(tx, parent.id, departmentIds);

    for (const childDate of childDates) {
      const child = await tx.event.create({
        data: { title, type, date: childDate, churchId, planningDeadline: deadlineFor(childDate), recurrenceRule, seriesId: parent.id },
      });
      await linkDepartments(tx, child.id, departmentIds);
    }

    return {
      success: true,
      resourceId: parent.id,
      childCount: childDates.length,
      ...(truncated ? { recurrenceTruncated: true, maxOccurrences: MAX_RECURRENCE_OCCURRENCES } : {}),
    };
  }

  const event = await tx.event.create({
    data: { title, type, date: eventDate, churchId, planningDeadline: deadlineFor(eventDate) },
  });
  await linkDepartments(tx, event.id, departmentIds);

  return { success: true, resourceId: event.id };
}

async function executeModificationEvenement(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>,
  ctx: { tx: TxClient; churchId: string; userId: string }
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;
  const changes = payload.changes as Record<string, unknown> | undefined;

  if (!eventId || !changes) {
    return { success: false, error: "Données manquantes : eventId, changes" };
  }

  const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, churchId: true, date: true } });
  if (!event) return { success: false, error: "Événement introuvable" };
  if (event.churchId !== churchId) return { success: false, error: "Événement hors périmètre" };

  const updated = await tx.event.update({
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

  if (updated.date.getTime() !== event.date.getTime()) {
    await planningBus.emit(
      "planning:event:rescheduled",
      ctx,
      { eventId, churchId, previousDate: event.date.toISOString(), newDate: updated.date.toISOString() }
    );
    const notices = await collectEventChangeNotices(
      tx,
      churchId,
      [{ kind: "MOVED", eventId, previousDate: event.date, newDate: updated.date }],
      { actorId: ctx.userId }
    );
    return { success: true, resourceId: eventId, notices };
  }

  return { success: true, resourceId: eventId };
}

async function executeAnnulationEvenement(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>,
  ctx: { tx: TxClient; churchId: string; userId: string },
  _requestId: string
): Promise<ExecutionResult> {
  const eventId = payload.eventId as string;

  if (!eventId) return { success: false, error: "Données manquantes : eventId" };

  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: { id: true, churchId: true },
  });
  if (!event) return { success: false, error: "Événement introuvable" };
  if (event.churchId !== churchId) return { success: false, error: "Événement hors périmètre" };

  // deleteEvents gère : émission bus, cleanup FK (planning + discipleship
  // via handler + eventReport + announcementEvent), puis suppression.
  const notices = await deleteEvents(ctx, [eventId]);

  return { success: true, resourceId: eventId, notices };
}

async function executeModificationPlanning(
  tx: TxClient,
  churchId: string,
  payload: Record<string, unknown>,
  actorId: string
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

  const currentDeptIds = new Set(currentEventDepts.map((ed) => ed.departmentId));
  const toAdd = departmentIds.filter((id) => !currentDeptIds.has(id));
  const toRemove = currentEventDepts.filter((ed) => !departmentIds.includes(ed.departmentId));

  if (toRemove.length > 0) {
    const removeIds = toRemove.map((ed) => ed.id);
    // Les STAR planifiés dans un département retiré ne servent plus : à notifier (spec 060).
    await recordRemovedPlannings(tx, churchId, removeIds, { actorId });
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

/** Contrôles de forme d'une demande d'accès : rôle autorisé et rattachement requis fourni. */
function demandeAccesError(
  targetUserId: string,
  role: string,
  ministryId: string | undefined,
  departmentIds: string[] | undefined
): string | null {
  if (!targetUserId || !role) return "Données manquantes : targetUserId, role";
  if (!DEMANDE_ACCES_ALLOWED_ROLES.includes(role as typeof DEMANDE_ACCES_ALLOWED_ROLES[number])) {
    return `Rôle non autorisé via demande d'accès : ${role}`;
  }
  if (role === "MINISTER" && !ministryId) return "ministryId requis pour le rôle MINISTER";
  if (role === "DEPARTMENT_HEAD" && !departmentIds?.length) return "departmentIds requis pour le rôle DEPARTMENT_HEAD";
  return null;
}

/** Utilisateur existant ; ministère et départements de l'église. */
async function demandeAccesScopeError(
  tx: TxClient,
  churchId: string,
  targetUserId: string,
  ministryId: string | undefined,
  departmentIds: string[] | undefined
): Promise<string | null> {
  const user = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!user) return "Utilisateur cible introuvable";
  if (ministryId) {
    const validMinistry = await tx.ministry.count({ where: { id: ministryId, churchId } });
    if (validMinistry === 0) return "Ministère invalide ou hors périmètre";
  }
  if (departmentIds && departmentIds.length > 0) {
    const validDepts = await tx.department.count({
      where: { id: { in: departmentIds }, ministry: { churchId } },
    });
    if (validDepts !== departmentIds.length) return "Départements invalides ou hors périmètre";
  }
  return null;
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

  const error =
    demandeAccesError(targetUserId, role, ministryId, departmentIds) ??
    (await demandeAccesScopeError(tx, churchId, targetUserId, ministryId, departmentIds));
  if (error) return { success: false, error };

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
