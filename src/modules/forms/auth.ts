import type { Session } from "next-auth";
import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";

/**
 * Gardes du module forms (spec 079). L'église qui fait foi est celle **du formulaire**, jamais
 * l'église affichée : un formulaire d'une autre église, supprimé ou inexistant donne le même 404.
 */

/** Église d'un formulaire non supprimé, ou 404. */
export async function resolveFormChurchId(formId: string): Promise<string> {
  const form = await prisma.form.findFirst({ where: { id: formId, deletedAt: null }, select: { churchId: true } });
  if (!form) throw new ApiError(404, "Formulaire introuvable");
  return form.churchId;
}

/** `forms:manage` dans l'église du formulaire ; renvoie la session et l'église. */
export async function requireFormManage(formId: string) {
  const churchId = await resolveFormChurchId(formId);
  const session = await requireChurchPermission("forms:manage", churchId);
  return { session, churchId };
}

/** Le compte appartient-il à l'église (un rôle, quel qu'il soit) ? Formulaires « comptes connectés ». */
export function isChurchMember(session: Session | null, churchId: string): boolean {
  if (!session?.user) return false;
  return session.user.isSuperAdmin === true || session.user.churchRoles.some((r) => r.churchId === churchId);
}

/** Périmètre d'un intervenant : une session entière (`levelId` nul) ou un niveau. */
export interface FormScope {
  sessionId: string;
  levelId: string | null;
}

export type FormAccess =
  | { kind: "manage"; session: Session; churchId: string }
  /** `scopes` nul : tout le formulaire. */
  | { kind: "facilitator"; session: Session; churchId: string; scopes: FormScope[] | null };

async function hasFormsManage(session: Session, churchId: string): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) return false;
  const { rolePermissions } = await import("@/lib/registry");
  return roles.some((r) => (rolePermissions[r.role] ?? []).includes("forms:manage"));
}

/**
 * Droits d'un compte sur un formulaire (lot 2) : gestion (`forms:manage` dans l'église du
 * formulaire) ou intervenant — donnée attribuée formulaire par formulaire, valable tant que le
 * formulaire n'est pas clôturé et que le compte appartient à l'église. Sinon null (404 pour
 * l'appelant, comme un formulaire inexistant).
 */
export async function getFormAccess(session: Session, formId: string): Promise<FormAccess | null> {
  const form = await prisma.form.findFirst({ where: { id: formId, deletedAt: null }, select: { churchId: true, status: true } });
  if (!form) return null;
  if (await hasFormsManage(session, form.churchId)) return { kind: "manage", session, churchId: form.churchId };
  if (form.status === "CLOSED" || !isChurchMember(session, form.churchId)) return null;
  const facilitator = await prisma.formFacilitator.findUnique({
    where: { formId_userId: { formId, userId: session.user.id } },
    select: { allScope: true, scopes: { select: { sessionId: true, levelId: true } } },
  });
  if (!facilitator) return null;
  return { kind: "facilitator", session, churchId: form.churchId, scopes: facilitator.allScope ? null : facilitator.scopes };
}

/** Gestion ou intervenant ; 404 sinon. */
export async function requireFormAccess(formId: string): Promise<FormAccess> {
  const session = await requireAuth();
  const access = await getFormAccess(session, formId);
  if (!access) throw new ApiError(404, "Formulaire introuvable");
  return access;
}

/** Les réponses visibles d'un intervenant, en filtre Prisma (rien pour la gestion). */
export function scopeWhere(access: FormAccess) {
  if (access.kind === "manage" || access.scopes === null) return {};
  if (access.scopes.length === 0) return { id: "__none__" };
  return { OR: access.scopes.map((s) => (s.levelId ? { sessionId: s.sessionId, levelId: s.levelId } : { sessionId: s.sessionId })) };
}
