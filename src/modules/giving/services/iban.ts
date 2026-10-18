/**
 * IBAN et BIC (spec 065) : fonctions pures, partagées par la validation du formulaire et
 * l'affichage de la page publique.
 */

/** Longueur de l'IBAN par pays (SEPA usuels) ; un autre pays est borné à 15–34 caractères. */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18,
  FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20,
  LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24,
  SM: 27,
};

/** Retire espaces et tirets, met en majuscules. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Clé ISO 13616 : les 4 premiers caractères passent à la fin, lettres → nombres, reste mod 97 = 1. */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.codePointAt(0) ?? 0;
    const digits = code >= 65 ? String(code - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/** Message d'erreur explicite, ou `null` si l'IBAN est valide. */
export function ibanError(value: string): string | null {
  const iban = normalizeIban(value);
  if (!iban) return "L'IBAN est obligatoire.";
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return "IBAN invalide : il commence par deux lettres et deux chiffres, suivis de lettres et de chiffres uniquement.";
  }
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected ? iban.length !== expected : iban.length < 15 || iban.length > 34) {
    return `IBAN invalide : ${iban.length} caractères au lieu de ${expected ?? "15 à 34"}.`;
  }
  if (mod97(iban) !== 1) return "IBAN invalide : la clé de contrôle ne correspond pas. Vérifiez les caractères saisis.";
  return null;
}

export function isValidIban(value: string): boolean {
  return ibanError(value) === null;
}

/** Affichage par groupes de 4 caractères. */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}

export function normalizeBic(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

/** BIC (ISO 9362) : 4 lettres de banque, 2 de pays, 2 de localisation, 3 optionnels d'agence. */
export function isValidBic(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalizeBic(value));
}
