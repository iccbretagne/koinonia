import type { Prisma } from "@/generated/prisma/client";
import type { Session } from "next-auth";
import { DEPT_FN } from "@/lib/department-functions";

type DbClient = Prisma.TransactionClient;

/**
 * Import différé du singleton Prisma — évite d'instancier un vrai client
 * (driver adapter MariaDB) au simple chargement du module `planning`, ce qui
 * casserait les tests important `@/modules/planning` sans mocker `@/lib/prisma`.
 */
async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

// Même raison : `@/lib/notifications` importe `@/lib/prisma` en tête de fichier.

/**
 * Droit de désigner/retirer une désignation d'ouverture ou de fermeture (spec 041). Composite,
 * ne peut pas s'exprimer comme une entrée `rolePermissions` classique :
 *   1. `events:manage` (Super Admin / Admin / Secrétaire) — géré en amont par l'appelant.
 *   2. Responsable ou adjoint d'un département de fonction SECURITE (`getUserDepartmentScope`).
 *   3. N'importe quel membre du département de fonction SECRETARIAT — contrairement au cas 2,
 *      peu importe son rôle dans ce département (exigence spec explicite).
 */
export async function canManageOpeningClosing(
  session: Session,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();

  // Import différé : `@/lib/auth` instancie NextAuth (donc `next/server`) au chargement du
  // module, ce qui casserait tout test important `@/modules/planning` sans mocker `@/lib/auth`.
  const { getUserDepartmentScope } = await import("@/lib/auth");
  const scope = getUserDepartmentScope(session, churchId);
  if (!scope.scoped) return true; // events:manage — déjà unscoped pour SUPER_ADMIN/ADMIN/SECRETARY

  if (scope.departmentIds.length > 0) {
    const securityDeptCount = await db.department.count({
      where: { id: { in: scope.departmentIds }, function: DEPT_FN.SECURITE },
    });
    if (securityDeptCount > 0) return true;
  }

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

/** Absence active du membre chevauchant la date de l'événement, ou `null` si aucune. */
export async function findActiveAbsenceForMember(
  churchId: string,
  memberId: string,
  eventDate: Date,
  db?: DbClient
): Promise<{ id: string; startDate: Date; endDate: Date } | null> {
  db ??= await defaultDb();

  const absence = await db.absence.findFirst({
    where: {
      churchId,
      memberId,
      status: "ACTIVE",
      startDate: { lte: eventDate },
      endDate: { gte: eventDate },
    },
    select: { id: true, startDate: true, endDate: true },
  });
  return absence;
}

async function resolveUserIdForMember(
  churchId: string,
  memberId: string,
  db: DbClient
): Promise<string | null> {
  const link = await db.memberUserLink.findUnique({
    where: { memberId_churchId: { memberId, churchId } },
    select: { userId: true },
  });
  return link?.userId ?? null;
}

/** Notifie le membre désigné — silencieux si son compte n'est pas lié. */
export async function notifyAssignment(
  churchId: string,
  memberId: string,
  eventTitle: string,
  slotLabel: string,
  db?: DbClient
): Promise<void> {
  db ??= await defaultDb();
  const userId = await resolveUserIdForMember(churchId, memberId, db);
  if (!userId) return;

  const { createNotification } = await import("@/lib/notifications");
  await createNotification({
    userId,
    type: "OPENING_CLOSING_ASSIGNED",
    title: `Désigné(e) pour ${slotLabel}`,
    message: `Vous avez été désigné(e) pour ${slotLabel.toLowerCase()} l'église lors de « ${eventTitle} ».`,
    link: "/planning",
  });
}

/** Notifie le membre retiré — silencieux si son compte n'est pas lié. */
export async function notifyRemoval(
  churchId: string,
  memberId: string,
  eventTitle: string,
  slotLabel: string,
  db?: DbClient
): Promise<void> {
  db ??= await defaultDb();
  const userId = await resolveUserIdForMember(churchId, memberId, db);
  if (!userId) return;

  const { createNotification } = await import("@/lib/notifications");
  await createNotification({
    userId,
    type: "OPENING_CLOSING_REMOVED",
    title: `Retiré(e) de ${slotLabel}`,
    message: `Vous n'êtes plus désigné(e) pour ${slotLabel.toLowerCase()} l'église lors de « ${eventTitle} ».`,
    link: "/planning",
  });
}
