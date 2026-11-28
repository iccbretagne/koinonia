/**
 * Réécriture des adresses mémorisées en base (spec 092, lot 4) — fonctions **pures**, utilisées par
 * `scripts/092-rewrite-stored-paths.ts` et testées seules. Aucune lecture ni écriture ici.
 *
 * Champs concernés : `AssistantEntry.href` et `AssistantEntry.screens` (préfixes d'aide),
 * `SystemMessage.linkUrl`, `Notification.link`. Une valeur inconnue, d'une autre origine ou déjà à
 * jour n'est jamais modifiée (idempotence). `reverse` rend l'ancienne forme (version de secours).
 */

import { rewriteScreenPrefix, rewriteStoredHref } from "./legacy-paths";

export type RewriteDirection = "forward" | "reverse";

/** Lien unique (`href`, `linkUrl`, `link`) : nouvelle valeur, ou `null` s'il ne change pas. */
export function rewriteLink(value: string | null | undefined, direction: RewriteDirection, appOrigin?: string | null): string | null {
  if (!value) return null;
  const next = rewriteStoredHref(value, direction, appOrigin);
  return next !== null && next !== value ? next : null;
}

/**
 * Préfixes d'aide (`screens`, tableau JSON de chaînes) : nouvelle liste, ou `null` si elle ne
 * change pas. Une valeur qui n'est pas un tableau de chaînes est laissée telle quelle (`null`).
 */
export function rewriteScreens(value: unknown, direction: RewriteDirection): string[] | null {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return null;
  const list = value as string[];
  const next: string[] = [];
  for (const prefix of list) {
    for (const p of rewriteScreenPrefix(prefix, direction)) if (!next.includes(p)) next.push(p);
  }
  const same = next.length === list.length && next.every((p, i) => p === list[i]);
  return same ? null : next;
}

/** Anciennes adresses citées dans un texte libre (`answer`) : à relire à la main, jamais réécrites. */
export function legacyMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s(«"'`])(\/[A-Za-z][A-Za-z0-9_\-/]*)/g)) {
    if (rewriteStoredHref(m[1], "forward")) found.add(m[1]);
  }
  return [...found];
}

/** Découpe en lots (500 par défaut) pour des mises à jour bornées. */
export function chunk<T>(items: readonly T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
