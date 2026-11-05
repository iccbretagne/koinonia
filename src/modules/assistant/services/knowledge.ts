import type { AssistantViewer } from "@/core/assistant";
import { fullRouteTable } from "@/lib/module-routes";
import { prisma } from "@/lib/prisma";
import { BUILTIN_ENTRIES } from "../knowledge";
import { ALL, type Audience, type KnowledgeEntry } from "../knowledge/types";

/**
 * Base lue (spec 075) = fiches fournies ⊕ corrections ⊕ ajouts ⊕ formulations rattachées,
 * fusionnées à la lecture : une mise à jour de Koinonia n'efface jamais une correction ni un
 * ajout du Super Admin.
 *
 * Une correction ne change que le texte d'une fiche fournie : son audience, son refus et sa
 * question de données restent ceux du code (le Super Admin ne peut pas élargir un accès).
 */

export const CUSTOM_KEY_PREFIX = "C-";

type EntryRow = Awaited<ReturnType<typeof prisma.assistantEntry.findMany>>[number];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

function customEntry(row: EntryRow): KnowledgeEntry {
  const roles = asStrings(row.roles);
  const audience: Audience = roles.length > 0 ? { roles } : ALL;
  return {
    key: `${CUSTOM_KEY_PREFIX}${row.id}`,
    kind: "howto",
    title: row.title,
    questions: asStrings(row.questions),
    answer: row.answer,
    href: row.href ?? undefined,
    hrefLabel: row.hrefLabel ?? undefined,
    audience,
    module: row.module ?? undefined,
    screens: asStrings(row.screens),
    origin: "custom",
  };
}

/** Applique une correction : un texte vide (masquage seul) garde le texte fourni. */
function overridden(builtin: KnowledgeEntry, row: EntryRow): KnowledgeEntry {
  const questions = asStrings(row.questions);
  if (questions.length === 0) return builtin;
  return {
    ...builtin,
    title: row.title,
    questions,
    answer: row.answer,
    href: row.href ?? builtin.href,
    hrefLabel: row.hrefLabel ?? builtin.hrefLabel,
    screens: asStrings(row.screens).length > 0 ? asStrings(row.screens) : builtin.screens,
    origin: "override",
  };
}

export interface LoadedKnowledge {
  /** Fiches actives (non masquées), avec leurs formulations rattachées. */
  entries: KnowledgeEntry[];
  /** Clés des fiches fournies masquées par le Super Admin. */
  hidden: Set<string>;
}

let cache: { at: number; value: LoadedKnowledge } | null = null;
const CACHE_MS = 60_000;

/** À appeler après toute écriture dans la base : la réponse sert dès la question suivante. */
export function invalidateKnowledge() {
  cache = null;
}

export async function loadKnowledge(now = Date.now()): Promise<LoadedKnowledge> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const [rows, aliases] = await Promise.all([
    prisma.assistantEntry.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.assistantAlias.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const overrides = new Map(rows.filter((r) => r.source === "OVERRIDE" && r.builtinKey).map((r) => [r.builtinKey!, r]));
  const hidden = new Set<string>();
  const entries: KnowledgeEntry[] = [];

  for (const builtin of BUILTIN_ENTRIES) {
    const row = overrides.get(builtin.key);
    if (row?.disabled) {
      hidden.add(builtin.key);
      continue;
    }
    entries.push(row ? overridden(builtin, row) : { ...builtin, origin: "builtin" });
  }
  for (const row of rows) {
    if (row.source === "CUSTOM" && !row.disabled) entries.push(customEntry(row));
  }

  const aliasesByKey = new Map<string, string[]>();
  for (const alias of aliases) {
    aliasesByKey.set(alias.entryKey, [...(aliasesByKey.get(alias.entryKey) ?? []), alias.text]);
  }
  const value: LoadedKnowledge = {
    entries: entries.map((e) => (aliasesByKey.has(e.key) ? { ...e, aliases: aliasesByKey.get(e.key) } : e)),
    hidden,
  };
  cache = { at: now, value };
  return value;
}

/** Module propriétaire d'une fiche : déclaré, sinon celui de son lien (table des routes). */
export function moduleOf(entry: Pick<KnowledgeEntry, "module" | "href">): string | null {
  if (entry.module) return entry.module;
  if (!entry.href) return null;
  const owner = fullRouteTable.resolve(entry.href.split("?")[0]);
  return owner.kind === "module" ? owner.owner : null;
}

/** La fiche ne mentionne jamais une fonction d'un module désactivé. */
export function isModuleVisible(entry: Pick<KnowledgeEntry, "module" | "href">, viewer: AssistantViewer): boolean {
  const owner = moduleOf(entry);
  return owner === null || viewer.modules.includes(owner);
}

/** La personne fait partie de l'audience de la fiche (rôle, permission ou prédicat). */
export function inAudience(audience: Audience, viewer: AssistantViewer): boolean {
  if (audience.all) return true;
  return (
    (audience.roles ?? []).some((r) => viewer.roles.includes(r)) ||
    (audience.permissions ?? []).some((p) => viewer.permissions.includes(p)) ||
    (audience.predicates ?? []).some((p) => viewer.predicates.includes(p))
  );
}

export interface ViewerEntries {
  /** Fiches auxquelles la personne a droit. */
  visible: KnowledgeEntry[];
  /** Fiches hors de son rôle mais qui ont un refus à lui donner (sans aucune donnée). */
  refusable: KnowledgeEntry[];
}

/** Filtre par module actif puis par audience, **avant** tout classement. */
export function viewerEntries(entries: readonly KnowledgeEntry[], viewer: AssistantViewer): ViewerEntries {
  const visible: KnowledgeEntry[] = [];
  const refusable: KnowledgeEntry[] = [];
  for (const entry of entries) {
    if (!isModuleVisible(entry, viewer)) continue;
    if (inAudience(entry.audience, viewer)) visible.push(entry);
    else if (entry.otherwise) refusable.push(entry);
  }
  return { visible, refusable };
}

/** Questions fréquentes de l'écran : fiches dont un préfixe d'écran couvre le chemin. */
export function entriesForScreen(entries: readonly KnowledgeEntry[], screen: string | undefined): KnowledgeEntry[] {
  if (!screen) return [];
  const best = (e: KnowledgeEntry) =>
    Math.max(-1, ...(e.screens ?? []).filter((p) => screen === p || screen.startsWith(`${p}/`)).map((p) => p.length));
  return entries
    .map((e) => ({ e, score: best(e) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}
