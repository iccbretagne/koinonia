import { ApiError } from "@/lib/api-utils";

/** Auteur d'une annonce emploi tel qu'exposé par l'API. */
export const JOBS_AUTHOR_INCLUDE = {
  author: { select: { id: true, name: true, displayName: true, image: true } },
} as const;

const JOBS_MODERATOR_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "SECRETARY"]);

type JobsSession = { user: { id: string; isSuperAdmin: boolean; churchRoles?: { role: string }[] } };

/** Modérateur du module emploi : Super Admin, ou Admin/Secrétaire d'une église. */
export function canManageJobs(session: JobsSession): boolean {
  return session.user.isSuperAdmin || (session.user.churchRoles?.some((r) => JOBS_MODERATOR_ROLES.has(r.role)) ?? false);
}

/** Droits de l'appelant sur une annonce : son auteur ou un modérateur. */
export function jobsAccess(session: JobsSession, authorId: string) {
  return { isAuthor: authorId === session.user.id, canManage: canManageJobs(session) };
}

/** Comme `jobsAccess`, mais refuse (403) un appelant qui n'est ni l'auteur ni un modérateur. */
export function requireJobsAuthorOrModerator(session: JobsSession, authorId: string) {
  const access = jobsAccess(session, authorId);
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
