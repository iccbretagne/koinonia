import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { BUILTIN_ENTRIES } from "../knowledge";
import type { KnowledgeEntry } from "../knowledge/types";
import type { EntryInput, EntryPatch } from "../schemas";
import { CUSTOM_KEY_PREFIX, invalidateKnowledge, loadKnowledge, moduleOf } from "./knowledge";
import type { AssistantActor } from "./settings";

/**
 * Base vue par le Super Admin (spec 075) : fiches fournies (corrigées ou masquées) et fiches
 * ajoutées. Toute écriture invalide la base en mémoire : la réponse sert dès la question suivante.
 */

export interface AdminEntry {
  key: string;
  kind: KnowledgeEntry["kind"];
  origin: "builtin" | "override" | "custom";
  hidden: boolean;
  title: string;
  questions: readonly string[];
  answer: string;
  href?: string;
  hrefLabel?: string;
  /** Rôles, permissions et prédicats, en clair pour l'écran. */
  audience: KnowledgeEntry["audience"];
  module: string | null;
  aliases: readonly string[];
}

const toAdmin = (e: KnowledgeEntry, hidden = false): AdminEntry => ({
  key: e.key,
  kind: e.kind,
  origin: e.origin ?? "builtin",
  hidden,
  title: e.title,
  questions: e.questions,
  answer: e.answer,
  href: e.href,
  hrefLabel: e.hrefLabel,
  audience: e.audience,
  module: moduleOf(e),
  aliases: e.aliases ?? [],
});

export async function listAdminEntries(): Promise<AdminEntry[]> {
  invalidateKnowledge();
  const { entries, hidden } = await loadKnowledge();
  const hiddenBuiltins = BUILTIN_ENTRIES.filter((e) => hidden.has(e.key)).map((e) => toAdmin(e, true));
  return [...entries.map((e) => toAdmin(e)), ...hiddenBuiltins];
}

function rowData(input: EntryInput) {
  return {
    title: input.title,
    questions: [...input.questions],
    answer: input.answer,
    href: input.href ?? null,
    hrefLabel: input.hrefLabel ?? null,
    roles: [...input.roles],
    module: input.module ?? null,
    screens: [...input.screens],
  };
}

const customId = (key: string) => (key.startsWith(CUSTOM_KEY_PREFIX) ? key.slice(CUSTOM_KEY_PREFIX.length) : null);

export async function createCustomEntry(input: EntryInput, actor: AssistantActor) {
  const row = await prisma.assistantEntry.create({
    data: { source: "CUSTOM", ...rowData(input), updatedById: actor.id },
  });
  await logAudit({ userId: actor.id, action: "CREATE", entityType: "AssistantEntry", entityId: row.id, details: { title: input.title } });
  invalidateKnowledge();
  return { key: `${CUSTOM_KEY_PREFIX}${row.id}` };
}

async function updateCustom(id: string, input: EntryInput, actor: AssistantActor) {
  const existing = await prisma.assistantEntry.findUnique({ where: { id } });
  if (existing?.source !== "CUSTOM") throw new ApiError(404, "Fiche introuvable");
  await prisma.assistantEntry.update({ where: { id }, data: { ...rowData(input), updatedById: actor.id } });
  await logAudit({ userId: actor.id, action: "UPDATE", entityType: "AssistantEntry", entityId: id, details: { title: input.title } });
}

async function patchBuiltin(key: string, patch: EntryPatch, actor: AssistantActor) {
  if (!BUILTIN_ENTRIES.some((e) => e.key === key)) throw new ApiError(404, "Fiche introuvable");
  const existing = await prisma.assistantEntry.findUnique({ where: { builtinKey: key } });
  const hasText = Array.isArray(existing?.questions) && existing.questions.length > 0;

  switch (patch.action) {
    case "override":
      await prisma.assistantEntry.upsert({
        where: { builtinKey: key },
        create: { source: "OVERRIDE", builtinKey: key, ...rowData(patch.entry), roles: [], updatedById: actor.id },
        update: { ...rowData(patch.entry), roles: [], updatedById: actor.id },
      });
      break;
    case "restore":
      // Rétablit le texte fourni ; un masquage éventuel est conservé.
      if (existing?.disabled) {
        await prisma.assistantEntry.update({
          where: { builtinKey: key },
          data: { title: "", questions: [], answer: "", href: null, hrefLabel: null, screens: [], updatedById: actor.id },
        });
      } else if (existing) {
        await prisma.assistantEntry.delete({ where: { builtinKey: key } });
      }
      break;
    case "hide":
      await prisma.assistantEntry.upsert({
        where: { builtinKey: key },
        create: { source: "OVERRIDE", builtinKey: key, title: "", questions: [], answer: "", roles: [], screens: [], disabled: true, updatedById: actor.id },
        update: { disabled: true, updatedById: actor.id },
      });
      break;
    case "show":
      if (existing && hasText) await prisma.assistantEntry.update({ where: { builtinKey: key }, data: { disabled: false, updatedById: actor.id } });
      else if (existing) await prisma.assistantEntry.delete({ where: { builtinKey: key } });
      break;
  }
  await logAudit({ userId: actor.id, action: "UPDATE", entityType: "AssistantEntry", entityId: key, details: { action: patch.action } });
}

/** Modifier une fiche : ajoutée (remplacement) ou fournie (corriger, rétablir, masquer, afficher). */
export async function patchEntry(key: string, patch: EntryPatch, actor: AssistantActor) {
  const id = customId(key);
  if (id) {
    if (patch.action !== "override") throw new ApiError(400, "Action réservée aux fiches fournies");
    await updateCustom(id, patch.entry, actor);
  } else {
    await patchBuiltin(key, patch, actor);
  }
  invalidateKnowledge();
}

/** Supprimer une fiche ajoutée (et ses formulations rattachées). Une fiche fournie se masque. */
export async function deleteCustomEntry(key: string, actor: AssistantActor) {
  const id = customId(key);
  if (!id) throw new ApiError(400, "Une fiche fournie se masque, elle ne se supprime pas");
  const existing = await prisma.assistantEntry.findUnique({ where: { id } });
  if (existing?.source !== "CUSTOM") throw new ApiError(404, "Fiche introuvable");
  await prisma.$transaction([
    prisma.assistantAlias.deleteMany({ where: { entryKey: key } }),
    prisma.assistantEntry.delete({ where: { id } }),
  ]);
  await logAudit({ userId: actor.id, action: "DELETE", entityType: "AssistantEntry", entityId: id, details: { title: existing.title } });
  invalidateKnowledge();
}
