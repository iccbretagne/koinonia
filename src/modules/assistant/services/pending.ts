import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import type { AssistantPendingReason, AssistantPendingStatus } from "@/generated/prisma/enums";
import type { EntryInput } from "../schemas";
import { createCustomEntry } from "./entries";
import { invalidateKnowledge, loadKnowledge } from "./knowledge";
import type { AssistantActor } from "./settings";
import { anonymize, lexicalSimilarity, normalize, tokens } from "./text";

/**
 * Questions à traiter (spec 075) : texte anonymisé, sans compte ni église, regroupé avec une
 * question ouverte très proche (même texte normalisé ou similarité ≥ 0,90). Le Super Admin y
 * répond (nouvelle fiche), les rattache à une fiche existante (formulation ajoutée) ou les
 * classe hors sujet ; la réponse sert dès la question suivante.
 */

export const GROUPING_SIMILARITY = 0.9;
const GROUPING_WINDOW = 200;

export async function recordPending(input: {
  text: string;
  reason: AssistantPendingReason;
  screen?: string;
  role?: string | null;
}) {
  const text = anonymize(input.text);
  if (!text) return;
  try {
    const open = await prisma.assistantPendingQuestion.findMany({
      where: { status: "OPEN" },
      orderBy: { lastAt: "desc" },
      take: GROUPING_WINDOW,
      select: { id: true, text: true },
    });
    const normalized = normalize(text);
    const words = tokens(text);
    const match = open.find(
      (q) => normalize(q.text) === normalized || lexicalSimilarity(words, tokens(q.text)) >= GROUPING_SIMILARITY
    );
    if (match) {
      await prisma.assistantPendingQuestion.update({
        where: { id: match.id },
        data: { count: { increment: 1 }, lastAt: new Date() },
      });
      return;
    }
    await prisma.assistantPendingQuestion.create({
      data: { text, reason: input.reason, screen: input.screen?.slice(0, 120) ?? null, role: input.role ?? null },
    });
  } catch {
    // Remonter une question ne doit jamais faire échouer la réponse.
  }
}

export async function listPending(status: AssistantPendingStatus = "OPEN") {
  return prisma.assistantPendingQuestion.findMany({
    where: { status },
    orderBy: [{ count: "desc" }, { lastAt: "desc" }],
    take: 200,
  });
}

async function pendingOrThrow(id: string) {
  const row = await prisma.assistantPendingQuestion.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "Question introuvable");
  return row;
}

async function resolve(id: string, status: AssistantPendingStatus, actor: AssistantActor, entryKey: string | null) {
  const row = await prisma.assistantPendingQuestion.update({
    where: { id },
    data: { status, entryKey, resolvedAt: new Date(), resolvedById: actor.id },
  });
  await logAudit({
    userId: actor.id,
    action: "UPDATE",
    entityType: "AssistantPendingQuestion",
    entityId: id,
    details: { status, entryKey },
  });
  return row;
}

/** Répondre : crée une fiche ajoutée qui répond à la question. */
export async function answerPending(id: string, entry: EntryInput, actor: AssistantActor) {
  const pending = await pendingOrThrow(id);
  const questions = entry.questions.includes(pending.text) ? entry.questions : [...entry.questions, pending.text];
  const created = await createCustomEntry({ ...entry, questions: questions.slice(0, 20) }, actor);
  return resolve(id, "ANSWERED", actor, created.key);
}

/** Rattacher : la question devient une formulation de la fiche choisie. */
export async function linkPending(id: string, entryKey: string, actor: AssistantActor) {
  const pending = await pendingOrThrow(id);
  const { entries } = await loadKnowledge();
  if (!entries.some((e) => e.key === entryKey)) throw new ApiError(400, "Fiche inconnue");
  await prisma.assistantAlias.create({ data: { entryKey, text: pending.text } });
  invalidateKnowledge();
  return resolve(id, "LINKED", actor, entryKey);
}

export async function markOffTopic(id: string, actor: AssistantActor) {
  await pendingOrThrow(id);
  return resolve(id, "OFF_TOPIC", actor, null);
}

export async function deletePending(id: string, actor: AssistantActor) {
  await pendingOrThrow(id);
  await prisma.assistantPendingQuestion.delete({ where: { id } });
  await logAudit({ userId: actor.id, action: "DELETE", entityType: "AssistantPendingQuestion", entityId: id });
}

export async function countOpenPending() {
  return prisma.assistantPendingQuestion.count({ where: { status: "OPEN" } });
}
