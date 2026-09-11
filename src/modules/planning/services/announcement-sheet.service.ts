import type { Prisma } from "@/generated/prisma/client";
import type { Session } from "next-auth";
import { DEPT_FN } from "@/lib/department-functions";
import { ApiError } from "@/lib/errors";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}
// Même raison que dans `opening-closing.service.ts` : différer `@/lib/auth` et
// `@/lib/notifications`, qui chargent respectivement `next-auth` et `@/lib/prisma` au niveau
// module — casserait tout test important `@/modules/planning` sans les mocker.

const COORDINATION_MINISTRY_NAME = "Coordination générale";

export const ALLOWED_SHEET_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const MAX_SHEET_SIZE = 20 * 1024 * 1024; // 20 Mo

export function validateSheetFile(mimeType: string, size: number): void {
  if (!(mimeType in ALLOWED_SHEET_MIME_TYPES)) {
    throw new ApiError(400, `Type de fichier non supporté : ${mimeType} (docx ou PDF uniquement)`);
  }
  if (size > MAX_SHEET_SIZE) {
    throw new ApiError(400, `Fichier trop lourd : ${Math.round(size / 1024 / 1024)}MB (max 20MB)`);
  }
}

export function getAnnouncementSheetKey(churchId: string, eventId: string, sheetId: string, ext: string): string {
  return `announcement-sheets/${churchId}/${eventId}/${sheetId}.${ext}`;
}

/** Id du ministère « Coordination générale » de l'église, `null` s'il n'existe pas encore. */
export async function findCoordinationMinistryId(
  churchId: string,
  db?: DbClient
): Promise<string | null> {
  db ??= await defaultDb();
  const ministry = await db.ministry.findFirst({
    where: { churchId, name: COORDINATION_MINISTRY_NAME },
    select: { id: true },
  });
  return ministry?.id ?? null;
}

/**
 * Droit de déposer/remplacer/retirer la feuille d'annonces d'un événement (spec 040). Composite,
 * ne peut pas s'exprimer comme une entrée `rolePermissions` classique :
 *   1. `events:manage` (Super Admin / Admin / Secrétaire) — géré en amont par l'appelant.
 *   2. N'importe quel membre du département de fonction SECRETARIAT, peu importe son rôle.
 *   3. Ministre du ministère Coordination générale (`getUserMinistryScope`).
 *   4. Responsable ou adjoint d'un département du ministère Coordination générale
 *      (`getUserDepartmentScope`).
 */
export async function canDepositAnnouncementSheet(
  session: Session,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();

  const { getUserDepartmentScope, getUserMinistryScope } = await import("@/lib/auth");

  const link = await db.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true },
  });
  if (link) {
    const secretariatMembership = await db.memberDepartment.count({
      where: { memberId: link.memberId, department: { function: DEPT_FN.SECRETARIAT } },
    });
    if (secretariatMembership > 0) return true;
  }

  const ministryScope = getUserMinistryScope(session, churchId);
  if (!ministryScope.scoped) return true; // events:manage — unscoped pour SUPER_ADMIN/ADMIN/SECRETARY

  const coordinationMinistryId = await findCoordinationMinistryId(churchId, db);
  if (!coordinationMinistryId) return false;

  if (ministryScope.ministryIds.includes(coordinationMinistryId)) return true;

  const deptScope = getUserDepartmentScope(session, churchId);
  if (deptScope.scoped && deptScope.departmentIds.length > 0) {
    const coordinationDeptCount = await db.department.count({
      where: { id: { in: deptScope.departmentIds }, ministryId: coordinationMinistryId },
    });
    if (coordinationDeptCount > 0) return true;
  }

  return false;
}

/**
 * Droit de télécharger la feuille d'annonces (spec 040, restreint) : sur-ensemble de
 * `canDepositAnnouncementSheet` (« les déposants eux-mêmes »), plus n'importe quel responsable
 * (ou adjoint) de département — tous départements confondus, pas seulement Coordination générale
 * — et n'importe quel membre STAR d'un département de fonction Modération.
 */
export async function canReadAnnouncementSheet(
  session: Session,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();

  if (await canDepositAnnouncementSheet(session, churchId, db)) return true;

  const { getUserDepartmentScope } = await import("@/lib/auth");
  const deptScope = getUserDepartmentScope(session, churchId);
  if (deptScope.scoped && deptScope.departmentIds.length > 0) return true;

  const link = await db.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true },
  });
  if (!link) return false;

  const moderationMembership = await db.memberDepartment.count({
    where: { memberId: link.memberId, department: { function: DEPT_FN.MODERATION } },
  });
  return moderationMembership > 0;
}

/** Résout l'ensemble unique des `userId` lecteurs (mêmes populations que `canReadAnnouncementSheet`). */
async function resolveReaderUserIds(churchId: string, db: DbClient): Promise<string[]> {
  const managers = await db.userChurchRole.findMany({
    where: { churchId, role: { in: ["SUPER_ADMIN", "ADMIN", "SECRETARY"] } },
    select: { userId: true },
  });

  const secretariatMembers = await db.userChurchRole.findMany({
    where: {
      churchId,
      departments: { some: { department: { function: DEPT_FN.SECRETARIAT, ministry: { churchId } } } },
    },
    select: { userId: true },
  });

  const coordinationMinistryId = await findCoordinationMinistryId(churchId, db);
  const coordinationMinisters = coordinationMinistryId
    ? await db.userChurchRole.findMany({
        where: { churchId, role: "MINISTER", ministryId: coordinationMinistryId },
        select: { userId: true },
      })
    : [];

  const departmentHeads = await db.userChurchRole.findMany({
    where: { churchId, departments: { some: {} } },
    select: { userId: true },
  });

  const moderationMembers = await db.userChurchRole.findMany({
    where: {
      churchId,
      departments: { some: { department: { function: DEPT_FN.MODERATION, ministry: { churchId } } } },
    },
    select: { userId: true },
  });

  return Array.from(
    new Set(
      [...managers, ...secretariatMembers, ...coordinationMinisters, ...departmentHeads, ...moderationMembers].map(
        (r) => r.userId
      )
    )
  );
}

/** Notifie tous les lecteurs d'un dépôt (initial) ou d'un remplacement (mise à jour). */
export async function notifyReaders(
  churchId: string,
  eventId: string,
  eventTitle: string,
  isUpdate: boolean,
  db?: DbClient
): Promise<void> {
  db ??= await defaultDb();

  const userIds = await resolveReaderUserIds(churchId, db);
  if (userIds.length === 0) return;

  const { createNotification } = await import("@/lib/notifications");
  const title = isUpdate ? "Trame des annonces mise à jour" : "Trame des annonces disponible";
  const message = isUpdate
    ? `La trame des annonces de « ${eventTitle} » a été mise à jour.`
    : `La trame des annonces de « ${eventTitle} » est disponible.`;

  await Promise.all(
    userIds.map((userId) =>
      createNotification({
        userId,
        type: "ANNOUNCEMENT_SHEET_DEPOSITED",
        title,
        message,
        link: `/events/${eventId}/star-view`,
      })
    )
  );
}
