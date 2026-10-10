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

/**
 * Droit de déposer/remplacer/retirer la feuille d'annonces d'un événement (spec 040, révision du
 * 2026-10-10 : réservé à l'administration et au Secrétariat) :
 *   1. Super Admin / Admin / Secrétaire (`getUserMinistryScope` non restreint — rôle réel ou
 *      entrée synthétique de l'équipe Secrétariat, spec 045).
 *   2. N'importe quel membre du département de fonction SECRETARIAT, peu importe son rôle.
 * La Coordination générale n'a plus que la lecture, comme tout Ministre (`canReadAnnouncementSheet`).
 */
export async function canDepositAnnouncementSheet(
  session: Session,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  const { getUserMinistryScope } = await import("@/lib/auth");
  if (!getUserMinistryScope(session, churchId).scoped) return true;

  db ??= await defaultDb();
  const link = await db.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true },
  });
  if (!link) return false;

  const secretariatMembership = await db.memberDepartment.count({
    where: { memberId: link.memberId, department: { function: DEPT_FN.SECRETARIAT } },
  });
  return secretariatMembership > 0;
}

/**
 * Droit de télécharger la feuille d'annonces (spec 040, restreint) : sur-ensemble de
 * `canDepositAnnouncementSheet` (« les déposants eux-mêmes »), plus n'importe quel Ministre et
 * n'importe quel responsable (ou adjoint) de département — tous ministères et départements
 * confondus — et n'importe quel membre STAR d'un département de fonction Modération.
 */
export async function canReadAnnouncementSheet(
  session: Session,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();

  if (await canDepositAnnouncementSheet(session, churchId, db)) return true;

  const { getUserDepartmentScope, getUserMinistryScope } = await import("@/lib/auth");
  const ministryScope = getUserMinistryScope(session, churchId);
  if (ministryScope.scoped && ministryScope.ministryIds.length > 0) return true;

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

  const ministers = await db.userChurchRole.findMany({
    where: { churchId, role: "MINISTER", ministryId: { not: null } },
    select: { userId: true },
  });

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
      [...managers, ...secretariatMembers, ...ministers, ...departmentHeads, ...moderationMembers].map(
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
        domain: "requests",
        type: "ANNOUNCEMENT_SHEET_DEPOSITED",
        title,
        message,
        link: `/events/${eventId}/star-view`,
      })
    )
  );
}
