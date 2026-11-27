import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { paths } from "@/lib/paths";

/**
 * Accès délégué aux formulaires et partage (spec 085). Un accès (`forms_grants`) ouvre l'outil
 * pour **ses** formulaires ; un co-gestionnaire (`form_managers`) partage ceux d'un autre. Ce
 * sont des données, évaluées par la garde du module (`auth.ts`) — jamais une permission de rôle.
 */

const userSelect = { id: true, name: true, displayName: true, email: true } as const;
const label = (u: { name: string | null; displayName: string | null; email?: string | null }) => u.displayName ?? u.name ?? u.email ?? null;

export interface FormsGrantView {
  userId: string;
  name: string | null;
  email: string | null;
  grantedBy: string | null;
  createdAt: string;
}

export async function listFormsGrants(churchId: string): Promise<FormsGrantView[]> {
  const rows = await prisma.formsGrant.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
    select: { userId: true, createdAt: true, user: { select: userSelect }, grantedBy: { select: userSelect } },
  });
  return rows.map((g) => ({
    userId: g.userId,
    name: label(g.user),
    email: g.user.email,
    grantedBy: g.grantedBy ? label(g.grantedBy) : null,
    createdAt: g.createdAt.toISOString(),
  }));
}

/** Compte appartenant à l'église (un rôle quelconque). */
async function assertChurchMember(churchId: string, userId: string) {
  const member = await prisma.userChurchRole.findFirst({ where: { churchId, userId }, select: { id: true } });
  if (!member) throw new ApiError(400, "Ce compte n'a aucun rôle dans cette église");
}

/** Accorde l'accès ; idempotent (déjà accordé ⇒ aucune écriture, aucune notification). */
export async function grantFormsAccess(churchId: string, actorId: string, userId: string): Promise<{ created: boolean }> {
  await assertChurchMember(churchId, userId);
  const existing = await prisma.formsGrant.findUnique({ where: { churchId_userId: { churchId, userId } }, select: { id: true } });
  if (existing) return { created: false };
  const grant = await prisma.formsGrant.create({ data: { churchId, userId, grantedById: actorId }, select: { id: true } });
  await logAudit({ userId: actorId, churchId, action: "CREATE", entityType: "FormsGrant", entityId: grant.id, details: { userId } });
  await createNotification({
    userId,
    domain: "forms",
    type: "FORMS_ACCESS_GRANTED",
    title: "Accès aux formulaires",
    message: "Vous pouvez créer et gérer vos propres formulaires.",
    link: paths.formulaires(),
  });
  return { created: true };
}

/** Retire l'accès ; les formulaires restent en ligne, les partages sont suspendus. */
export async function revokeFormsAccess(churchId: string, actorId: string, userId: string): Promise<void> {
  const existing = await prisma.formsGrant.findUnique({ where: { churchId_userId: { churchId, userId } }, select: { id: true } });
  if (!existing) throw new ApiError(404, "Accès introuvable");
  await prisma.formsGrant.delete({ where: { id: existing.id } });
  await logAudit({ userId: actorId, churchId, action: "DELETE", entityType: "FormsGrant", entityId: existing.id, details: { userId } });
  await createNotification({
    userId,
    domain: "forms",
    type: "FORMS_ACCESS_REVOKED",
    title: "Accès aux formulaires retiré",
    message: "Vous ne pouvez plus gérer de formulaires. Vos formulaires restent en ligne.",
    link: paths.formulaires(),
  });
}

/** Comptes de l'église proposés à l'octroi (recherche par nom ou email). */
export async function searchChurchUsersForFormsGrant(churchId: string, q: string) {
  const users = await prisma.user.findMany({
    where: {
      churchRoles: { some: { churchId } },
      OR: [{ name: { contains: q } }, { displayName: { contains: q } }, { email: { contains: q } }],
    },
    take: 10,
    orderBy: { name: "asc" },
    select: userSelect,
  });
  return users.map((u) => ({ id: u.id, name: label(u), email: u.email }));
}

// ─── Partage d'un formulaire ──────────────────────────────────────────────

export async function listFormManagers(formId: string) {
  const rows = await prisma.formManager.findMany({
    where: { formId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, createdAt: true, user: { select: userSelect }, addedBy: { select: userSelect } },
  });
  return rows.map((m) => ({
    userId: m.userId,
    name: label(m.user),
    email: m.user.email,
    addedBy: m.addedBy ? label(m.addedBy) : null,
    createdAt: m.createdAt.toISOString(),
  }));
}

/** Partage avec un compte ayant l'accès délégué ou `forms:manage` ; idempotent. */
export async function addFormManager(formId: string, churchId: string, actorId: string, userId: string): Promise<{ created: boolean }> {
  const form = await prisma.form.findFirst({ where: { id: formId, deletedAt: null }, select: { title: true, createdById: true } });
  if (!form) throw new ApiError(404, "Formulaire introuvable");
  if (form.createdById === userId) throw new ApiError(400, "Cette personne est déjà l'auteur du formulaire");
  await assertChurchMember(churchId, userId);
  const grant = await prisma.formsGrant.findUnique({ where: { churchId_userId: { churchId, userId } }, select: { id: true } });
  if (!grant) {
    const { rolePermissions } = await import("@/lib/registry");
    const roles = await prisma.userChurchRole.findMany({ where: { churchId, userId }, select: { role: true } });
    if (!roles.some((r) => (rolePermissions[r.role] ?? []).includes("forms:manage"))) {
      throw new ApiError(400, "Ce compte n'a pas accès à l'outil de formulaires");
    }
  }
  const existing = await prisma.formManager.findUnique({ where: { formId_userId: { formId, userId } }, select: { userId: true } });
  if (existing) return { created: false };
  await prisma.formManager.create({ data: { formId, userId, addedById: actorId } });
  await logAudit({ userId: actorId, churchId, action: "CREATE", entityType: "FormManager", entityId: formId, details: { userId } });
  await createNotification({
    userId,
    domain: "forms",
    type: "FORM_SHARED",
    title: form.title,
    message: "Ce formulaire est partagé avec vous : vous pouvez le gérer.",
    link: paths.formulaires.form(formId),
    entityType: "Form",
    entityId: formId,
  });
  return { created: true };
}

export async function removeFormManager(formId: string, churchId: string, actorId: string, userId: string): Promise<void> {
  const existing = await prisma.formManager.findUnique({
    where: { formId_userId: { formId, userId } },
    select: { userId: true, form: { select: { title: true } } },
  });
  if (!existing) throw new ApiError(404, "Partage introuvable");
  await prisma.formManager.delete({ where: { formId_userId: { formId, userId } } });
  await logAudit({ userId: actorId, churchId, action: "DELETE", entityType: "FormManager", entityId: formId, details: { userId } });
  await createNotification({
    userId,
    domain: "forms",
    type: "FORM_UNSHARED",
    title: existing.form.title,
    message: "Ce formulaire n'est plus partagé avec vous.",
    link: paths.formulaires(),
    entityType: "Form",
    entityId: formId,
  });
}
