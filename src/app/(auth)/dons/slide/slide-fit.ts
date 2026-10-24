/**
 * Ajustements de la slide de dons (spec 065) : tout doit tenir dans la scène 1920 × 1080, mesuré
 * sur le rendu réel et non estimé au nombre de caractères. Fonctions pures : la mesure du DOM est
 * passée en paramètre, ce qui les rend testables sans navigateur.
 */

export const URL_MAX = 60;
export const URL_MIN_ONE_LINE = 44;
export const URL_MIN = 34;
export const VERSE_MAX = 34;
export const VERSE_MIN = 24;
export const QR_MAX = 470;
export const QR_MIN = 300;

/** Adresse telle qu'affichée : sans `https://` ni barre finale. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Première proposition du verset, jusqu'au premier « ; » : la slide se lit de loin. */
export function slideVerse(text: string): string {
  return text.split(";")[0].trim();
}

/**
 * Adresse courte sous le QR code : sur une ligne de 60 à 44 px, puis sur deux lignes (domaine,
 * puis chemin) jusqu'à 34 px. En dernier recours, une ligne à 34 px.
 * `fits(lines, size)` dit si ces lignes tiennent dans le cadre à cette taille.
 */
export function fitUrlLines(
  url: string,
  fits: (lines: string[], size: number) => boolean
): { lines: string[]; size: number } {
  const tryLines = (lines: string[], min: number) => {
    for (let size = URL_MAX; size >= min; size -= 2) {
      if (fits(lines, size)) return { lines, size };
    }
    return null;
  };
  const cut = url.indexOf("/");
  return (
    tryLines([url], URL_MIN_ONE_LINE) ??
    (cut > 0 ? tryLines([url.slice(0, cut), url.slice(cut)], URL_MIN) : null) ?? { lines: [url], size: URL_MIN }
  );
}

/**
 * Verset sur une ligne, police de 34 à 24 px ; s'il ne tient toujours pas, retour à la ligne.
 * `fits(size)` dit si le verset tient sur une ligne à cette taille.
 */
export function fitVerse(fits: (size: number) => boolean): { size: number; wrap: boolean } {
  for (let size = VERSE_MAX; size >= VERSE_MIN; size -= 1) {
    if (fits(size)) return { size, wrap: false };
  }
  return { size: VERSE_MIN, wrap: true };
}

/**
 * Taille du QR code : réduite par pas de 10 px, de 470 à 300 px au plus bas (portée de scan),
 * tant que le contenu dépasse de la scène. `overflows(size)` mesure avec cette taille.
 */
export function fitQrSize(overflows: (size: number) => boolean): number {
  let size = QR_MAX;
  while (size > QR_MIN && overflows(size)) size -= 10;
  return size;
}

/** Titre « Dîmes & Offrandes » (spec 066 : 120 → 100 px pour laisser la place au nom et au logo). */
export const SLIDE_TITLE_PX = 100;

/** Tailles du nom de l'église sur la slide (spec 066). SMALL = rendu d'origine. */
export const SLIDE_NAME_PX = { SMALL: 26, MEDIUM: 40, LARGE: 56 } as const;
/** Hauteur fixe de la ligne du nom et du logo : une ligne du nom en Grand (56 × 1,2). */
export const SLIDE_IDENTITY_H = 68;
export const SLIDE_LOGO_H = 64;
export const SLIDE_LOGO_MAX_W = 480;

/**
 * Nom de l'église sur sa ligne : de la taille choisie jusqu'à 26 px par pas de 2 px ; s'il ne
 * tient toujours pas, retour à la ligne à 26 px (jamais coupé). `fits(size)` dit si le nom tient
 * sur une ligne à cette taille.
 */
export function fitName(start: number, fits: (size: number) => boolean): { size: number; wrap: boolean } {
  for (let size = start; size >= SLIDE_NAME_PX.SMALL; size -= 2) {
    if (fits(size)) return { size, wrap: false };
  }
  return { size: SLIDE_NAME_PX.SMALL, wrap: true };
}
