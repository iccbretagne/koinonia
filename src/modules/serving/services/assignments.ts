import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { ServingActor } from "../auth";
import type { AssignmentAction } from "./state";
import { ACTIVE_ASSIGNMENT_STATUSES, addMonths, canTransition } from "./state";
import { canDecideAssignment } from "./access";
import { loadApplication } from "./applications";
import { getServingDurations } from "./settings";
import { notifyAssigned, notifyConfirmed, notifySentBack, SERVING_ENTITY } from "./notifications";

/**
 * Affectations d'une candidature (spec 073) : le PVS oriente vers un ou plusieurs départements,
 * chaque département accueille (début d'observation), confirme ou renvoie au PVS.
 *
 * Le module ne peut pas importer `planning` : l'ajout et le retrait de la fiche STAR dans le
 * département sont injectés par la route.
 */

/** Ajoute la fiche STAR au département (`attachMemberToDepartment` du module planning). */
export type AttachMember = (memberId: string, departmentId: string, churchId: string) => Promise<unknown>;
/** Retire la fiche STAR du département (`detachMemberFromDepartment` du module planning). */
export type DetachMember = (memberId: string, departmentId: string, churchId: string) => Promise<unknown>;

function statusOf(err: unknown): number | null {
  return err instanceof ApiError ? err.statusCode : null;
}

async function safeNotify(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    // La décision est enregistrée : un échec de notification ne la remet pas en cause.
    logger.error({ err }, label);
  }
}

// ── Orientation par le PVS ──────────────────────────────────────────────────

/**
 * Oriente la candidature vers des départements de l'église. Possible pour une candidature reçue,
 * ou validée après un renvoi (réaffectation) ; les renvois en attente sont alors traités.
 */
export async function assignApplication(actor: ServingActor, id: string, departmentIds: string[]) {
  if (!actor.canManage) throw new Error("FORBIDDEN");
  const app = await loadApplication(id);
  if (!app || app.churchId !== actor.churchId) throw new ApiError(404, "Candidature introuvable");
  if (app.status === "REJECTED") throw new ApiError(409, "Cette candidature n'est pas retenue.");

  const ids = [...new Set(departmentIds)];
  const depts = await prisma.department.findMany({
    where: { id: { in: ids }, isSystem: false, ministry: { churchId: actor.churchId } },
    select: { id: true, name: true },
  });
  if (depts.length !== ids.length) throw new ApiError(400, "Département introuvable dans cette église.");

  const active = app.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));
  const duplicate = depts.find((d) => active.some((a) => a.departmentId === d.id));
  if (duplicate) throw new ApiError(409, `La personne est déjà orientée vers ${duplicate.name}.`);

  if (app.memberId) {
    const already = await prisma.memberDepartment.findFirst({
      where: { memberId: app.memberId, departmentId: { in: ids } },
      select: { department: { select: { name: true } } },
    });
    if (already) throw new ApiError(409, `Cette fiche STAR appartient déjà à ${already.department.name}.`);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.servingAssignment.createMany({
      data: ids.map((departmentId) => ({ applicationId: id, departmentId, assignedById: actor.userId })),
    }),
    prisma.servingApplication.update({
      where: { id },
      data:
        app.status === "RECEIVED"
          ? { status: "VALIDATED", decidedAt: now, decidedById: actor.userId }
          : { status: "VALIDATED" },
    }),
    prisma.servingAssignment.updateMany({
      where: { applicationId: id, status: "SENT_BACK", resolvedAt: null },
      data: { resolvedAt: now },
    }),
  ]);

  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: SERVING_ENTITY,
    entityId: id,
    details: { action: "assign", departmentIds: ids },
  });

  const who = { applicationId: id, firstName: app.firstName, lastName: app.lastName };
  for (const d of depts) {
    await safeNotify("Notification d'orientation échouée", () => notifyAssigned(actor.churchId, d.id, d.name, who));
  }
}

// ── Décisions du département ────────────────────────────────────────────────

async function loadDecidableAssignment(actor: ServingActor, assignmentId: string, action: AssignmentAction) {
  const assignment = await prisma.servingAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      department: { select: { id: true, name: true, ministryId: true } },
      application: { select: { id: true, churchId: true, firstName: true, lastName: true, email: true, phone: true, memberId: true } },
    },
  });
  if (!assignment || assignment.application.churchId !== actor.churchId) {
    throw new ApiError(404, "Affectation introuvable");
  }
  if (!canDecideAssignment(actor.user, actor.churchId, assignment.department)) throw new Error("FORBIDDEN");
  if (!canTransition(assignment.status, action)) {
    throw new ApiError(409, "Cette affectation a déjà changé d'état : recharge la page.");
  }
  return assignment;
}

/**
 * Accueil : la personne devient STAR du département et la période d'observation commence. Sans
 * fiche STAR rattachée, une fiche est créée à partir de la candidature.
 */
export async function acceptAssignment(actor: ServingActor, assignmentId: string, attach: AttachMember): Promise<string> {
  const a = await loadDecidableAssignment(actor, assignmentId, "accept");
  const app = a.application;

  let memberId = app.memberId;
  let created = false;
  if (!memberId) {
    const member = await prisma.member.create({
      data: { firstName: app.firstName, lastName: app.lastName, email: app.email, phone: app.phone },
      select: { id: true },
    });
    memberId = member.id;
    created = true;
  }

  try {
    await attach(memberId, a.departmentId, actor.churchId);
  } catch (err) {
    // Déjà membre du département : l'accueil reste valable.
    if (statusOf(err) !== 409) {
      if (created) await prisma.member.delete({ where: { id: memberId } }).catch(() => undefined);
      throw err;
    }
  }
  if (created) await prisma.servingApplication.update({ where: { id: app.id }, data: { memberId } });

  const now = new Date();
  const { observationMonths } = await getServingDurations(actor.churchId);
  const { count } = await prisma.servingAssignment.updateMany({
    where: { id: assignmentId, status: "PENDING" },
    data: {
      status: "OBSERVATION",
      acceptedAt: now,
      acceptedById: actor.userId,
      observationEndsAt: addMonths(now, observationMonths),
    },
  });
  if (count === 0) throw new ApiError(409, "Cette affectation a déjà changé d'état : recharge la page.");

  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: SERVING_ENTITY,
    entityId: app.id,
    details: { action: "accept", departmentId: a.departmentId, memberId },
  });
  return app.id;
}

/** Confirmation à l'issue (ou avant la fin) de l'observation. */
export async function confirmAssignment(actor: ServingActor, assignmentId: string): Promise<string> {
  const a = await loadDecidableAssignment(actor, assignmentId, "confirm");
  const { count } = await prisma.servingAssignment.updateMany({
    where: { id: assignmentId, status: "OBSERVATION" },
    data: { status: "CONFIRMED", decidedAt: new Date(), decidedById: actor.userId },
  });
  if (count === 0) throw new ApiError(409, "Cette affectation a déjà changé d'état : recharge la page.");

  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: SERVING_ENTITY,
    entityId: a.application.id,
    details: { action: "confirm", departmentId: a.departmentId },
  });
  const who = { applicationId: a.application.id, firstName: a.application.firstName, lastName: a.application.lastName };
  await safeNotify("Notification de confirmation échouée", () =>
    notifyConfirmed(actor.churchId, actor.pvsDeptIds, a.department.name, who)
  );
  return a.application.id;
}

/**
 * Renvoi au PVS, avant l'accueil ou pendant l'observation, avec un motif. Pendant l'observation,
 * la personne est retirée du département (ses services à venir y sont supprimés).
 */
export async function sendBackAssignment(
  actor: ServingActor,
  assignmentId: string,
  reason: string,
  detach: DetachMember
): Promise<string> {
  const a = await loadDecidableAssignment(actor, assignmentId, "send-back");
  if (a.status === "OBSERVATION" && a.application.memberId) {
    try {
      await detach(a.application.memberId, a.departmentId, actor.churchId);
    } catch (err) {
      // Déjà retiré du département à la main : rien à défaire.
      if (statusOf(err) !== 404) throw err;
    }
  }

  const { count } = await prisma.servingAssignment.updateMany({
    where: { id: assignmentId, status: a.status },
    data: { status: "SENT_BACK", decidedAt: new Date(), decidedById: actor.userId, sentBackReason: reason },
  });
  if (count === 0) throw new ApiError(409, "Cette affectation a déjà changé d'état : recharge la page.");

  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: SERVING_ENTITY,
    entityId: a.application.id,
    details: { action: "send-back", departmentId: a.departmentId },
  });
  const who = { applicationId: a.application.id, firstName: a.application.firstName, lastName: a.application.lastName };
  await safeNotify("Notification de renvoi échouée", () =>
    notifySentBack(actor.churchId, actor.pvsDeptIds, a.department.name, who)
  );
  return a.application.id;
}
