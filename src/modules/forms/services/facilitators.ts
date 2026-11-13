import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { notifyUsers } from "@/lib/notifications";

/**
 * Intervenants d'une inscription à sessions (spec 079, lot 2) : des comptes de l'église qui voient
 * les inscrits de leur périmètre (tout le formulaire, une session ou un niveau) et font l'appel.
 * Ni export, ni annulation, ni modification du formulaire. Leur accès s'éteint à la clôture.
 */

export interface FacilitatorInput {
  userId: string;
  allScope: boolean;
  scopes: { sessionId: string; levelId?: string | null }[];
}

export async function listFacilitators(formId: string) {
  const rows = await prisma.formFacilitator.findMany({
    where: { formId },
    include: {
      user: { select: { id: true, name: true, displayName: true, email: true } },
      scopes: { select: { sessionId: true, levelId: true } },
    },
    orderBy: { id: "asc" },
  });
  return rows.map((f) => ({
    userId: f.userId,
    name: f.user.displayName ?? f.user.name ?? f.user.email,
    allScope: f.allScope,
    scopes: f.scopes,
  }));
}

/** Remplace la liste des intervenants ; les nouveaux sont prévenus. */
export async function setFacilitators(formId: string, churchId: string, input: FacilitatorInput[]) {
  const form = await prisma.form.findFirst({
    where: { id: formId, deletedAt: null },
    select: { title: true, kind: true, sessions: { select: { id: true, levels: { select: { id: true } } } } },
  });
  if (!form) throw new ApiError(404, "Formulaire introuvable");
  if (input.length > 0 && (form.kind !== "REGISTRATION" || form.sessions.length === 0)) {
    throw new ApiError(400, "Les intervenants concernent les inscriptions à sessions");
  }
  const userIds = [...new Set(input.map((f) => f.userId))];
  if (userIds.length !== input.length) throw new ApiError(400, "Un intervenant apparaît deux fois");
  const members = await prisma.userChurchRole.findMany({ where: { churchId, userId: { in: userIds } }, select: { userId: true } });
  const memberIds = new Set(members.map((m) => m.userId));
  if (userIds.some((id) => !memberIds.has(id))) throw new ApiError(400, "Un intervenant doit appartenir à l'église");
  const levelsBySession = new Map(form.sessions.map((s) => [s.id, new Set(s.levels.map((l) => l.id))]));
  for (const f of input) {
    if (!f.allScope && f.scopes.length === 0) throw new ApiError(400, "Choisissez au moins une session ou un niveau");
    for (const scope of f.scopes) {
      const levels = levelsBySession.get(scope.sessionId);
      if (!levels || (scope.levelId && !levels.has(scope.levelId))) throw new ApiError(400, "Session ou niveau inconnu");
    }
  }

  const before = new Set((await prisma.formFacilitator.findMany({ where: { formId }, select: { userId: true } })).map((f) => f.userId));
  await prisma.$transaction(async (tx) => {
    await tx.formFacilitator.deleteMany({ where: { formId } });
    for (const f of input) {
      await tx.formFacilitator.create({
        data: {
          formId,
          userId: f.userId,
          allScope: f.allScope,
          scopes: f.allScope ? undefined : { create: f.scopes.map((s) => ({ sessionId: s.sessionId, levelId: s.levelId ?? null })) },
        },
      });
    }
  });
  const added = userIds.filter((id) => !before.has(id));
  if (added.length) {
    await notifyUsers(added, {
      domain: "forms",
      type: "FORM_FACILITATOR",
      title: form.title,
      message: "Vous êtes intervenant : liste des inscrits et feuille de présence.",
      link: `/formulaires/${formId}`,
      entityType: "Form",
      entityId: formId,
    });
  }
  return listFacilitators(formId);
}

/** Formulaires où ce compte intervient (non clôturés, de ses églises). */
export async function listFacilitatedForms(userId: string, churchIds: readonly string[]) {
  return prisma.form.findMany({
    where: { deletedAt: null, status: { not: "CLOSED" }, churchId: { in: [...churchIds] }, facilitators: { some: { userId } } },
    select: { id: true, title: true, status: true, closesAt: true, churchId: true, _count: { select: { sessions: true } } },
    orderBy: { createdAt: "desc" },
  });
}
