import { randomUUID } from "node:crypto";
import type { Prisma, ServingAssignmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { ApplicationData } from "../schemas";
import { getPvsDepartmentIds, type ServingActor } from "../auth";
import { canViewApplication, isDepartmentLead, isOwnApplication, type DepartmentRef } from "./access";
import { ACTIVE_ASSIGNMENT_STATUSES, hasPendingSendBack, needsPvsAction } from "./state";
import { deletePhoto, readPhoto, servingPhotoKey, storePhoto } from "./photo";
import { renderApplicationPdf } from "./pdf";
import { notifyNewApplication, SERVING_ENTITY } from "./notifications";

/**
 * Candidatures au service (spec 073) : dépôt public, listes PVS et département, consultation
 * journalisée, non-retenue et rattachement à une fiche STAR existante.
 */

// ── Dépôt public ────────────────────────────────────────────────────────────

/**
 * Enregistre une candidature reçue du formulaire public. La photo (déjà normalisée) est déposée
 * avant la ligne : si l'écriture en base échoue, la photo est retirée.
 */
export async function submitApplication(
  churchId: string,
  pvsDeptIds: string[],
  data: ApplicationData,
  photoJpeg: Buffer
): Promise<void> {
  const photoKey = servingPhotoKey(churchId, randomUUID());
  await storePhoto(photoKey, photoJpeg);

  let app: { id: string; firstName: string; lastName: string };
  try {
    app = await prisma.servingApplication.create({
      data: {
        ...data,
        pcncTrainings: data.pcncTrainings,
        churchId,
        photoKey,
        consentAt: new Date(),
      },
      select: { id: true, firstName: true, lastName: true },
    });
  } catch (err) {
    await deletePhoto(photoKey).catch(() => undefined);
    throw err;
  }

  try {
    await notifyNewApplication(churchId, pvsDeptIds, { applicationId: app.id, ...app });
  } catch (err) {
    // La candidature est enregistrée : un échec de notification ne doit pas la faire repartir.
    logger.error({ err }, "Notification de nouvelle candidature échouée");
  }
}

// ── Listes ──────────────────────────────────────────────────────────────────

export type ApplicationBucket = "todo" | "ongoing" | "archived";

export type AssignmentSummary = {
  id: string;
  departmentId: string;
  departmentName: string;
  status: ServingAssignmentStatus;
  observationEndsAt: string | null;
  /** Observation arrivée à échéance sans décision (relances, D4). */
  overdue: boolean;
  decidedAt: string | null;
  /** Visible du PVS et du département qui a renvoyé (trace), jamais du STAR. */
  sentBackReason: string | null;
};

export type ApplicationSummary = {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  status: "RECEIVED" | "VALIDATED" | "REJECTED";
  bucket: ApplicationBucket;
  /** Fiche consultable par l'appelant (faux pour la seule trace d'un renvoi). */
  canOpen: boolean;
  assignments: AssignmentSummary[];
};

const assignmentInclude = {
  assignments: {
    orderBy: { assignedAt: "asc" },
    include: { department: { select: { id: true, name: true, ministryId: true } } },
  },
} satisfies Prisma.ServingApplicationInclude;

type AppWithAssignments = Prisma.ServingApplicationGetPayload<{ include: typeof assignmentInclude }>;

export function bucketOf(app: Pick<AppWithAssignments, "status" | "createdAt" | "decidedAt" | "assignments">): ApplicationBucket {
  if (needsPvsAction(app)) return "todo";
  if (app.status === "REJECTED") return "archived";
  return app.assignments.some((a) => a.status === "PENDING" || a.status === "OBSERVATION") ? "ongoing" : "archived";
}

function toAssignmentSummary(a: AppWithAssignments["assignments"][number]): AssignmentSummary {
  return {
    id: a.id,
    departmentId: a.departmentId,
    departmentName: a.department.name,
    status: a.status,
    observationEndsAt: a.observationEndsAt?.toISOString() ?? null,
    overdue: a.status === "OBSERVATION" && a.observationEndsAt !== null && a.observationEndsAt.getTime() <= Date.now(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
    sentBackReason: a.sentBackReason,
  };
}

/** Départements de l'église dont l'appelant est responsable ou Ministre. */
async function leadDepartments(actor: ServingActor): Promise<DepartmentRef[]> {
  const depts = await prisma.department.findMany({
    where: { ministry: { churchId: actor.churchId } },
    select: { id: true, ministryId: true },
  });
  return depts.filter((d) => isDepartmentLead(actor.user, actor.churchId, d));
}

/**
 * Vue PVS : toutes les candidatures de l'église. Vue département : celles qui ont (ou ont eu) une
 * affectation dans un département de l'appelant, réduites à ces affectations.
 */
export async function listApplications(actor: ServingActor, view: "pvs" | "department"): Promise<ApplicationSummary[]> {
  if (view === "pvs") {
    if (!actor.canManage) throw new Error("FORBIDDEN");
    const apps = await prisma.servingApplication.findMany({
      where: { churchId: actor.churchId },
      include: assignmentInclude,
      orderBy: { createdAt: "desc" },
    });
    return apps.map((app) => ({
      id: app.id,
      firstName: app.firstName,
      lastName: app.lastName,
      createdAt: app.createdAt.toISOString(),
      status: app.status,
      bucket: bucketOf(app),
      canOpen: true,
      assignments: app.assignments.map(toAssignmentSummary),
    }));
  }

  const deptIds = (await leadDepartments(actor)).map((d) => d.id);
  if (deptIds.length === 0) return [];
  const apps = await prisma.servingApplication.findMany({
    where: { churchId: actor.churchId, assignments: { some: { departmentId: { in: deptIds } } } },
    include: assignmentInclude,
    orderBy: { createdAt: "desc" },
  });
  return apps.map((app) => {
    const mine = app.assignments.filter((a) => deptIds.includes(a.departmentId));
    const canOpen = mine.some((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));
    const ongoing = mine.some((a) => a.status === "PENDING" || a.status === "OBSERVATION");
    return {
      id: app.id,
      firstName: app.firstName,
      lastName: app.lastName,
      createdAt: app.createdAt.toISOString(),
      status: app.status,
      bucket: ongoing ? "ongoing" : "archived",
      canOpen,
      assignments: mine.map(toAssignmentSummary),
    };
  });
}

/** Candidatures que l'appelant peut ouvrir, pour décider du lien « Candidatures » du menu. */
export async function hasServingAccess(actor: ServingActor): Promise<boolean> {
  if (actor.canManage) return true;
  const deptIds = (await leadDepartments(actor)).map((d) => d.id);
  if (deptIds.length === 0) return false;
  const count = await prisma.servingAssignment.count({
    where: { departmentId: { in: deptIds }, application: { churchId: actor.churchId } },
  });
  return count > 0;
}

// ── Fiche ───────────────────────────────────────────────────────────────────

const detailInclude = {
  ...assignmentInclude,
  member: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.ServingApplicationInclude;

export type ApplicationRecord = Prisma.ServingApplicationGetPayload<{ include: typeof detailInclude }>;

export async function loadApplication(id: string): Promise<ApplicationRecord | null> {
  return prisma.servingApplication.findUnique({ where: { id }, include: detailInclude });
}

function assertSameChurch(actor: ServingActor, app: { churchId: string } | null): asserts app {
  if (!app || app.churchId !== actor.churchId) throw new ApiError(404, "Candidature introuvable");
}

/** Lecture autorisée de la fiche (gestionnaire ou département actif), sans journalisation. */
export async function requireViewableApplication(actor: ServingActor, id: string): Promise<ApplicationRecord> {
  const app = await loadApplication(id);
  assertSameChurch(actor, app);
  if (!canViewApplication(actor.user, actor.churchId, actor.canManage, app.assignments)) {
    throw new Error("FORBIDDEN");
  }
  return app;
}

export type ApplicationDetail = Omit<
  ApplicationRecord,
  "assignments" | "member" | "photoKey" | "birthDate" | "baptismDate" | "consentAt" | "decidedAt" | "createdAt" | "updatedAt" | "purgeWarnedAt"
> & {
  birthDate: string;
  baptismDate: string | null;
  consentAt: string;
  decidedAt: string | null;
  createdAt: string;
  pcncTrainings: string[];
  member: { id: string; firstName: string; lastName: string; email: string | null } | null;
  assignments: (AssignmentSummary & { leads: boolean })[];
  bucket: ApplicationBucket;
  hasPendingSendBack: boolean;
  /** Droits de l'appelant sur cette fiche, pour l'interface. */
  canManage: boolean;
};

function toDetail(actor: ServingActor, app: ApplicationRecord): ApplicationDetail {
  const { photoKey: _photoKey, purgeWarnedAt: _purge, updatedAt: _u, ...rest } = app;
  // Hors PVS : ni motif de non-retenue, ni affectations des autres départements.
  const visible = actor.canManage
    ? app.assignments
    : app.assignments.filter((a) => isDepartmentLead(actor.user, actor.churchId, a.department));
  return {
    ...rest,
    rejectionReason: actor.canManage ? app.rejectionReason : null,
    birthDate: app.birthDate.toISOString().slice(0, 10),
    baptismDate: app.baptismDate?.toISOString().slice(0, 10) ?? null,
    consentAt: app.consentAt.toISOString(),
    decidedAt: app.decidedAt?.toISOString() ?? null,
    createdAt: app.createdAt.toISOString(),
    pcncTrainings: Array.isArray(app.pcncTrainings) ? (app.pcncTrainings as string[]) : [],
    member: actor.canManage ? app.member : null,
    assignments: visible.map((a) => ({
      ...toAssignmentSummary(a),
      leads: isDepartmentLead(actor.user, actor.churchId, a.department) || actor.user.isSuperAdmin,
    })),
    bucket: bucketOf(app),
    hasPendingSendBack: hasPendingSendBack(app),
    canManage: actor.canManage,
  };
}

/** Fiche complète pour le PVS ou un département actif ; chaque consultation est journalisée. */
export async function getApplication(actor: ServingActor, id: string): Promise<ApplicationDetail> {
  const app = await requireViewableApplication(actor, id);
  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "VIEW",
    entityType: SERVING_ENTITY,
    entityId: app.id,
  });
  return toDetail(actor, app);
}

// ── Décisions PVS ───────────────────────────────────────────────────────────

async function requireManagedApplication(actor: ServingActor, id: string): Promise<ApplicationRecord> {
  if (!actor.canManage) throw new Error("FORBIDDEN");
  const app = await loadApplication(id);
  assertSameChurch(actor, app);
  return app;
}

/**
 * Ne pas retenir : possible pour une candidature reçue, ou validée sans affectation active (tous
 * ses départements l'ont renvoyée). Les renvois en attente sont considérés comme traités.
 */
export async function rejectApplication(actor: ServingActor, id: string, reason: string | undefined) {
  const app = await requireManagedApplication(actor, id);
  if (app.status === "REJECTED") throw new ApiError(409, "Cette candidature n'est déjà pas retenue.");
  if (app.assignments.some((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status))) {
    throw new ApiError(409, "Un département suit encore cette personne : attends sa décision ou son renvoi.");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.servingApplication.update({
      where: { id },
      data: { status: "REJECTED", decidedAt: now, decidedById: actor.userId, rejectionReason: reason || null },
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
    details: { action: "reject" },
  });
}

/**
 * Rattache la candidature à une fiche STAR existante de l'église (ou retire le rattachement).
 * Impossible une fois la personne accueillie : la fiche STAR porte alors son appartenance.
 */
export async function linkMember(actor: ServingActor, id: string, memberId: string | null) {
  const app = await requireManagedApplication(actor, id);
  if (app.assignments.some((a) => a.status === "OBSERVATION" || a.status === "CONFIRMED")) {
    throw new ApiError(409, "La personne est déjà accueillie : le rattachement ne peut plus changer.");
  }
  if (memberId) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, departments: { some: { department: { ministry: { churchId: actor.churchId } } } } },
      select: { id: true },
    });
    if (!member) throw new ApiError(404, "Fiche STAR introuvable dans cette église");
  }
  await prisma.servingApplication.update({ where: { id }, data: { memberId } });
  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: SERVING_ENTITY,
    entityId: id,
    details: { action: "link-member", memberId },
  });
}

// ── Photo et PDF ────────────────────────────────────────────────────────────

/**
 * Lecture de la photo ou du PDF : gestionnaire, département actif, ou le STAR lui-même une fois
 * accueilli (D8).
 */
async function requireReadableApplication(actor: ServingActor, id: string): Promise<ApplicationRecord> {
  const app = await loadApplication(id);
  assertSameChurch(actor, app);
  if (
    !canViewApplication(actor.user, actor.churchId, actor.canManage, app.assignments) &&
    !isOwnApplication(actor.linkedMemberIds, app)
  ) {
    throw new Error("FORBIDDEN");
  }
  return app;
}

export async function getApplicationPhoto(actor: ServingActor, id: string): Promise<Buffer> {
  const app = await requireReadableApplication(actor, id);
  return readPhoto(app.photoKey);
}

/** PDF de la fiche ; chaque téléchargement est journalisé (`EXPORT`). */
export async function exportApplicationPdf(
  actor: ServingActor,
  id: string,
  churchLogo: Buffer | null
): Promise<{ pdf: Buffer; filename: string }> {
  const app = await requireReadableApplication(actor, id);
  const [photo, church] = await Promise.all([
    readPhoto(app.photoKey),
    prisma.church.findUniqueOrThrow({ where: { id: app.churchId }, select: { name: true } }),
  ]);
  const pdf = await renderApplicationPdf(
    {
      ...app,
      pcncTrainings: Array.isArray(app.pcncTrainings) ? (app.pcncTrainings as string[]) : [],
    },
    photo,
    { name: church.name, logo: churchLogo }
  );
  await logAudit({
    userId: actor.userId,
    churchId: actor.churchId,
    action: "EXPORT",
    entityType: SERVING_ENTITY,
    entityId: app.id,
  });
  const slug = `${app.firstName}-${app.lastName}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase();
  return { pdf, filename: `candidature-${slug}.pdf` };
}

// ── Église du formulaire public ─────────────────────────────────────────────

/**
 * Église qui reçoit les candidatures à cette adresse publique, ou `null` si elle est inconnue ou
 * n'a pas de département PVS : aucune candidature ne doit arriver sans personne pour la recevoir.
 */
export async function resolvePublicChurch(
  slug: string
): Promise<{ id: string; name: string; pvsDeptIds: string[] } | null> {
  const church = await prisma.church.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!church) return null;
  const pvsDeptIds = await getPvsDepartmentIds(church.id);
  return pvsDeptIds.length > 0 ? { ...church, pvsDeptIds } : null;
}
