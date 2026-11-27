/**
 * Déplacement clavier dans un groupe d'éléments (onglets, menu, contrôle segmenté) : flèches,
 * Début, Fin, en sautant les éléments désactivés et en bouclant. Pur, partagé et testé.
 */

export type RovingOrientation = "horizontal" | "vertical";

/**
 * Index atteint depuis `current` par la touche `key`, ou `null` si la touche ne déplace pas.
 * `disabled[i]` vrai = élément sauté. Renvoie `current` si aucun autre élément n'est actif.
 */
export function rovingIndex(
  current: number,
  key: string,
  disabled: readonly boolean[],
  orientation: RovingOrientation = "horizontal",
): number | null {
  const count = disabled.length;
  if (count === 0) return null;
  const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";

  const firstEnabled = (from: number, step: 1 | -1): number => {
    for (let n = 0; n < count; n++) {
      const i = (((from + step * n) % count) + count) % count;
      if (!disabled[i]) return i;
    }
    return current;
  };

  switch (key) {
    case next:
      return firstEnabled(current + 1, 1);
    case prev:
      return firstEnabled(current - 1, -1);
    case "Home":
      return firstEnabled(0, 1);
    case "End":
      return firstEnabled(count - 1, -1);
    default:
      return null;
  }
}
