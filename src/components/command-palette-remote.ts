/**
 * État de chargement d'une catégorie distante de la palette de recherche (STAR, événements) —
 * indépendant de React pour être testable sans DOM (docs/design-system/components/CommandPalette.md).
 */
export type Remote<T> = { status: "idle" | "loading" | "unavailable" } | { status: "ready"; rows: T[] };

/**
 * Remise à "idle" d'une catégorie encore "loading" quand sa requête est annulée — typiquement un
 * repassage sous le seuil de recherche pendant le chargement. Sans cette remise à zéro, la
 * catégorie reste bloquée sur "loading" (le chargeur ne recharge que depuis "idle") et ne se
 * recharge plus jamais au prochain passage au-dessus du seuil.
 */
export function resetLoadingToIdle<T>(remote: Remote<T>): Remote<T> {
  return remote.status === "loading" ? { status: "idle" } : remote;
}
