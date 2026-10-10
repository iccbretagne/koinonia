import { ApiError } from "@/lib/api-utils";

/** Auteur d'une annonce emploi tel qu'exposé par l'API. */
export const JOBS_AUTHOR_INCLUDE = {
  author: { select: { id: true, name: true, displayName: true, image: true } },
} as const;

type JobsSession = { user: { id: string; isSuperAdmin: boolean; churchRoles?: { role: string }[] } };

/**
 * Modérateur du module emploi : Super Admin, ou permission transverse `jobs:manage` dans l'une
 * de ses églises (matrice des manifestes, `rolePermissions`), comme les autres permissions
 * `jobs:*` (`requirePlatformPermission`).
 */
export async function canManageJobs(session: JobsSession): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  // Import dynamique : registry.ts importe tous les modules (dont jobs), un import statique
  // ici créerait un cycle (cf. issue #446).
  const { rolePermissions } = await import("@/lib/registry");
  return session.user.churchRoles?.some((r) => rolePermissions[r.role]?.includes("jobs:manage")) ?? false;
}

/** Droits de l'appelant sur une annonce : son auteur ou un modérateur. */
export async function jobsAccess(session: JobsSession, authorId: string) {
  return { isAuthor: authorId === session.user.id, canManage: await canManageJobs(session) };
}

/** Comme `jobsAccess`, mais refuse (403) un appelant qui n'est ni l'auteur ni un modérateur. */
export async function requireJobsAuthorOrModerator(session: JobsSession, authorId: string) {
  const access = await jobsAccess(session, authorId);
  if (!access.isAuthor && !access.canManage) throw new ApiError(403, "Accès refusé");
  return access;
}

/**
 * Champ date optionnel et effaçable d'un PATCH : absent → inchangé, `null`/vide → effacé,
 * chaîne ISO → convertie en `Date`.
 */
export function patchDate<K extends string>(key: K, value: string | null | undefined): Partial<Record<K, Date | null>> {
  if (value === undefined) return {};
  return { [key]: value ? new Date(value) : null } as Record<K, Date | null>;
}
