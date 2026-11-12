import type { Session } from "next-auth";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { reconcileWithdrawalsAfterGridEdit, recordPlanningChanges, sendReplacedConfirmation } from "@/modules/planning";
import type { planningSchema } from "./contract";

export type PlanningInput = z.infer<typeof planningSchema>["plannings"];

/**
 * Enregistre la grille d'un département pour un événement (même code pour l'écran et l'assistant
 * IA — spec 081, lot 3). L'appelant a déjà vérifié `planning:edit` dans l'église de l'événement
 * et le périmètre du département ; ici : date limite, rattachement, membres du département,
 * un seul débrief, journal, désistements et notifications.
 */
export async function savePlanning(
  session: Session,
  eventChurchId: string,
  eventId: string,
  departmentId: string,
  plannings: PlanningInput,
  details: Record<string, unknown> = {}
) {
  // Check planning deadline
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { planningDeadline: true, title: true },
  });

  if (event?.planningDeadline && new Date() > new Date(event.planningDeadline)) {
    // After deadline, only ADMIN and SECRETARY in this church can modify
    const churchRoles = session.user.churchRoles
      .filter((r) => r.churchId === eventChurchId)
      .map((r) => r.role);
    const canBypass = churchRoles.some(
      (r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "SECRETARY"
    );
    if (!canBypass) {
      throw new ApiError(
        403,
        "La date limite de planification est dépassée"
      );
    }
  }

  // Verify department belongs to same church as event
  const planDeptCheck = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { ministry: { select: { churchId: true } } },
  });
  if (!planDeptCheck) throw new ApiError(404, "Département introuvable");
  if (planDeptCheck.ministry.churchId !== eventChurchId) {
    throw new ApiError(403, "Ce département n'appartient pas à l'église de cet événement");
  }

  // Find or create event-department link
  let eventDept = await prisma.eventDepartment.findUnique({
    where: {
      eventId_departmentId: { eventId, departmentId },
    },
  });

  eventDept ??= await prisma.eventDepartment.create({
    data: { eventId, departmentId },
  });

  // Validate: all members must belong to this department
  const memberIds = plannings.map((p) => p.memberId);
  if (memberIds.length > 0) {
    const validMembers = await prisma.member.findMany({
      where: { id: { in: memberIds }, departments: { some: { departmentId } } },
      select: { id: true },
    });
    if (validMembers.length !== memberIds.length) {
      throw new ApiError(400, "Un ou plusieurs membres n'appartiennent pas à ce département");
    }
  }

  // Validate: only one EN_SERVICE_DEBRIEF per department per event
  const debriefCount = plannings.filter(
    (p) => p.status === "EN_SERVICE_DEBRIEF"
  ).length;
  if (debriefCount > 1) {
    throw new ApiError(
      400,
      "Only one member can have EN_SERVICE_DEBRIEF status per department per event"
    );
  }

  // Snapshot état précédent pour détecter les changements à notifier
  const prevPlannings = memberIds.length > 0
    ? await prisma.planning.findMany({
        where: { eventDepartmentId: eventDept!.id, memberId: { in: memberIds } },
        select: { memberId: true, status: true },
      })
    : [];
  const prevStatusMap = new Map(prevPlannings.map((p) => [p.memberId, p.status]));

  const results = await Promise.all(
    plannings.map((p) =>
      prisma.planning.upsert({
        where: {
          eventDepartmentId_memberId: {
            eventDepartmentId: eventDept!.id,
            memberId: p.memberId,
          },
        },
        update: { status: p.status },
        create: {
          eventDepartmentId: eventDept!.id,
          memberId: p.memberId,
          status: p.status,
        },
      })
    )
  );

  await logAudit({
    userId: session.user.id,
    churchId: eventChurchId,
    action: "UPDATE",
    entityType: "Planning",
    entityId: eventDept!.id,
    details: { eventId, departmentId, count: plannings.length, ...details },
  });

  // Placer quelqu'un depuis la grille pourvoit un désistement en attente ; replacer le STAR
  // désisté l'annule (spec 061). Le STAR remplacé reçoit sa confirmation immédiatement.
  try {
    const filled = await reconcileWithdrawalsAfterGridEdit(prisma, {
      eventId,
      departmentId,
      before: prevStatusMap,
      after: plannings,
      actorId: session.user.id,
    });
    for (const f of filled) await sendReplacedConfirmation(prisma, f.withdrawalId, f.replacementName);
  } catch (error) {
    console.error("[planning] rapprochement des désistements impossible", error);
  }

  // Les STAR dont le service change sont prévenus en un seul récapitulatif, une fois le délai
  // de l'église écoulé sans nouvelle modification (spec 060) ; rien ne part ici.
  try {
    await recordPlanningChanges(
      prisma,
      eventChurchId,
      plannings
        .filter((p) => (prevStatusMap.get(p.memberId) ?? null) !== p.status)
        .map((p) => ({
          memberId: p.memberId,
          eventId,
          departmentId,
          previousStatus: prevStatusMap.get(p.memberId) ?? null,
        })),
      { actorId: session.user.id }
    );
  } catch (error) {
    console.error("[planning] enregistrement des changements à notifier impossible", error);
  }

  return results;
}
