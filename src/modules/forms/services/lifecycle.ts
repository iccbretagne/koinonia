import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { ACTIVE_STATUSES, FORM_INCLUDE, getForm, type FormWithQuestions } from "./builder";

/**
 * Cycle de vie d'un formulaire (spec 079) : brouillon → publié → clôturé.
 *
 * - **Fin des réponses** (`closesAt`) : le formulaire reste publié, il n'accepte plus de réponse.
 * - **Clôture** (`status = CLOSED`, `closedAt`) : manuelle, ou automatique à la fin des réponses
 *   (tâche planifiée). La durée de conservation court à partir d'elle.
 * - **Suppression** : réponses effacées tout de suite ; le formulaire est gardé (`deletedAt`) pour
 *   le journal et pour répondre comme une adresse inconnue.
 */

export const UNAVAILABLE = "Ce formulaire n'est pas disponible.";

/** Le formulaire accepte-t-il des réponses à cet instant (hors nombre maximal) ? */
export function acceptsResponses(form: { status: string; deletedAt: Date | null; opensAt: Date | null; closesAt: Date | null }, now = new Date()) {
  if (form.status !== "PUBLISHED" || form.deletedAt) return false;
  if (form.opensAt && form.opensAt > now) return false;
  if (form.closesAt && form.closesAt <= now) return false;
  return true;
}

/** Nombre maximal atteint ? (réponses actives : confirmées, en attente, proposées). */
export async function isFull(form: { id: string; maxResponses: number | null }, db: Prisma.TransactionClient = prisma) {
  if (!form.maxResponses) return false;
  const count = await db.formResponse.count({ where: { formId: form.id, status: { in: [...ACTIVE_STATUSES] } } });
  return count >= form.maxResponses;
}

/** Contrôles avant publication : de quoi répondre, et une adresse de contact pour un public nominatif. */
function assertPublishable(form: FormWithQuestions) {
  if (form.questions.length === 0) throw new ApiError(400, "Ajoutez au moins une question avant de publier");
  if (form.access === "PUBLIC" && !form.anonymous && !form.questions.some((q) => q.type === "EMAIL" && q.required && !q.conditionQuestionId)) {
    throw new ApiError(
      400,
      "Un formulaire public nominatif demande une question « Email » obligatoire : elle sert à l'accusé de réception et à repérer les doublons"
    );
  }
}

export async function changeStatus(formId: string, action: "publish" | "close" | "reopen") {
  const form = await getForm(formId);
  if (!form) throw new ApiError(404, "Formulaire introuvable");
  if (form.purgedAt) throw new ApiError(409, "Les réponses de ce formulaire ont été effacées : il ne peut plus rouvrir");
  const now = new Date();
  switch (action) {
    case "publish":
      if (form.status !== "DRAFT") throw new ApiError(409, "Seul un brouillon se publie");
      assertPublishable(form);
      return prisma.form.update({ where: { id: formId }, data: { status: "PUBLISHED" }, include: FORM_INCLUDE });
    case "close":
      if (form.status !== "PUBLISHED") throw new ApiError(409, "Seul un formulaire publié se clôture");
      return prisma.form.update({ where: { id: formId }, data: { status: "CLOSED", closedAt: now }, include: FORM_INCLUDE });
    case "reopen":
      if (form.status !== "CLOSED") throw new ApiError(409, "Seul un formulaire clôturé se rouvre");
      if (form.closesAt && form.closesAt <= now) throw new ApiError(409, "Repoussez d'abord la fin des réponses");
      return prisma.form.update({ where: { id: formId }, data: { status: "PUBLISHED", closedAt: null }, include: FORM_INCLUDE });
  }
}

/** Suppression : réponses effacées (cascade), formulaire marqué supprimé. */
export async function deleteForm(formId: string) {
  const form = await getForm(formId);
  if (!form) throw new ApiError(404, "Formulaire introuvable");
  await prisma.$transaction([
    prisma.formResponse.deleteMany({ where: { formId } }),
    prisma.formAnonymousReceipt.deleteMany({ where: { formId } }),
    prisma.form.update({ where: { id: formId }, data: { deletedAt: new Date(), status: "CLOSED", closedAt: form.closedAt ?? new Date() } }),
  ]);
}

/**
 * Formulaire auquel on peut répondre, par son adresse publique ; null pour toute autre raison
 * (inexistant, autre église, brouillon, clôturé, supprimé, pas encore ouvert, réponses finies,
 * nombre maximal atteint) — la page et l'API répondent alors le même « non disponible ».
 */
export async function loadAnswerableForm(churchSlug: string, formSlug: string, now = new Date()) {
  const form = await prisma.form.findFirst({
    where: { slug: formSlug, church: { slug: churchSlug }, deletedAt: null, status: "PUBLISHED" },
    include: { ...FORM_INCLUDE, church: { select: { id: true, name: true, slug: true } } },
  });
  if (!form || !acceptsResponses(form, now) || (await isFull(form))) return null;
  return form;
}

export type AnswerableForm = NonNullable<Awaited<ReturnType<typeof loadAnswerableForm>>>;
