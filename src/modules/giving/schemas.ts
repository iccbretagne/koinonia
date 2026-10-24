import { z } from "zod";
import { GivingNameSize } from "@/generated/prisma/enums";
import { ibanError, isValidBic, normalizeBic, normalizeIban } from "./services/iban";

/**
 * Schémas purs du module (zod et fonctions IBAN pures), importables par le contrat d'API
 * (ADR-0023) sans tirer Prisma ni NextAuth.
 */

/** Texte facultatif : espaces retirés, chaîne vide → `null`. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullish()
    .transform((v) => v || null);
}

/** Adresse web facultative, en https uniquement (exclut `javascript:` et `http:`). */
function optionalHttpsUrl(max: number) {
  return optionalText(max).refine(
    (v) => {
      if (v === null) return true;
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "L'adresse doit être un lien web commençant par https://." }
  );
}

export const givingPageSchema = z
  .object({
    churchId: z.string().min(1),
    enabled: z.boolean(),
    intro: optionalText(1000),

    onlineEnabled: z.boolean(),
    onlineUrl: optionalHttpsUrl(500),
    onlineDescription: optionalText(1000),
    onlineNote: optionalText(200),

    transferEnabled: z.boolean(),
    beneficiary: optionalText(140),
    iban: optionalText(42).transform((v) => (v ? normalizeIban(v) : null)),
    bic: optionalText(14).transform((v) => (v ? normalizeBic(v) : null)),
    transferReference: optionalText(140),

    onsiteEnabled: z.boolean(),
    checkPayee: optionalText(140),
    onsiteText: optionalText(1000),

    taxReceiptEnabled: z.boolean(),
    taxReceiptText: optionalText(2000),

    verseText: optionalText(500),
    verseReference: optionalText(80),
    contactEmail: optionalText(254).refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: "Adresse email invalide.",
    }),
    address: optionalText(255),
    socialHandle: optionalText(80),

    shortUrl: optionalHttpsUrl(255),

    // Nom et logo de l'église (spec 066). Valeurs par défaut = rendu d'origine, pour qu'un
    // formulaire ouvert avant le déploiement reste valide. `logoKey` n'en fait pas partie : seul
    // le service du logo l'écrit.
    pageChurchNameShown: z.boolean().default(true),
    pageChurchNameSize: z.nativeEnum(GivingNameSize).default("SMALL"),
    slideChurchNameShown: z.boolean().default(true),
    slideChurchNameSize: z.nativeEnum(GivingNameSize).default("SMALL"),
    pageLogoShown: z.boolean().default(true),
    slideLogoShown: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    for (const [path, message] of [...bankDetailErrors(d), ...missingSectionFields(d)]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }
  });

type FieldError = [path: string, message: string];

/** IBAN et BIC renseignés mais invalides. */
function bankDetailErrors(d: { iban: string | null; bic: string | null }): FieldError[] {
  const errors: FieldError[] = [];
  const ibanMessage = d.iban ? ibanError(d.iban) : null;
  if (ibanMessage) errors.push(["iban", ibanMessage]);
  if (d.bic && !isValidBic(d.bic)) errors.push(["bic", "BIC invalide : 8 ou 11 caractères (ex. AGRIFRPP)."]);
  return errors;
}

/** Champs obligatoires des sections activées, chacun rattaché à son champ. */
function missingSectionFields(d: {
  onlineEnabled: boolean; onlineUrl: string | null;
  transferEnabled: boolean; beneficiary: string | null; iban: string | null;
  onsiteEnabled: boolean; checkPayee: string | null;
  taxReceiptEnabled: boolean; taxReceiptText: string | null;
}): FieldError[] {
  const rules: [active: boolean, value: string | null, path: string, message: string][] = [
    [d.onlineEnabled, d.onlineUrl, "onlineUrl", "Le lien est obligatoire quand le don en ligne est affiché."],
    [d.transferEnabled, d.beneficiary, "beneficiary", "Le bénéficiaire est obligatoire quand le virement est affiché."],
    [d.transferEnabled, d.iban, "iban", "L'IBAN est obligatoire quand le virement est affiché."],
    [d.onsiteEnabled, d.checkPayee, "checkPayee", "L'ordre des chèques est obligatoire quand « Sur place » est affiché."],
    [d.taxReceiptEnabled, d.taxReceiptText, "taxReceiptText", "Le texte est obligatoire quand le reçu fiscal est affiché."],
  ];
  return rules.filter(([active, value]) => active && !value).map(([, , path, message]) => [path, message]);
}

export type GivingPageInput = z.infer<typeof givingPageSchema>;

/** Contenu d'une page de dons, tel qu'enregistré (sans l'église). */
export type GivingPageContent = Omit<GivingPageInput, "churchId">;

/** Page publique : uniquement les sections activées, sans identifiant interne. */
export interface PublicGivingPage {
  churchName: string;
  /** Taille du nom dans l'en-tête ; `null` = nom masqué (spec 066). */
  churchNameSize: GivingNameSize | null;
  /** Logo de l'en-tête, si déposé et affiché (spec 066). */
  logo: { src: string } | null;
  intro: string | null;
  online: { url: string; description: string | null; note: string | null } | null;
  transfer: { beneficiary: string; iban: string; bic: string | null; reference: string | null } | null;
  onsite: { checkPayee: string; text: string | null } | null;
  taxReceipt: { text: string } | null;
  verse: { text: string; reference: string | null } | null;
  footer: { contactEmail: string | null; address: string | null; socialHandle: string | null };
}

/**
 * Projection d'un contenu vers la page publique : seules les sections activées et complètes
 * apparaissent. Pure, pour servir à la fois la page publique et l'aperçu du paramétrage.
 */
export function toPublicGivingPage(
  churchName: string,
  c: GivingPageContent,
  logoSrc: string | null = null
): PublicGivingPage {
  return {
    churchName,
    churchNameSize: c.pageChurchNameShown ? c.pageChurchNameSize : null,
    logo: c.pageLogoShown && logoSrc ? { src: logoSrc } : null,
    intro: c.intro,
    online: c.onlineEnabled && c.onlineUrl ? { url: c.onlineUrl, description: c.onlineDescription, note: c.onlineNote } : null,
    transfer:
      c.transferEnabled && c.beneficiary && c.iban
        ? { beneficiary: c.beneficiary, iban: c.iban, bic: c.bic, reference: c.transferReference }
        : null,
    onsite: c.onsiteEnabled && c.checkPayee ? { checkPayee: c.checkPayee, text: c.onsiteText } : null,
    taxReceipt: c.taxReceiptEnabled && c.taxReceiptText ? { text: c.taxReceiptText } : null,
    verse: c.verseText ? { text: c.verseText, reference: c.verseReference } : null,
    footer: { contactEmail: c.contactEmail, address: c.address, socialHandle: c.socialHandle },
  };
}

/** Sections activables de la page publique. */
export type GivingSection = "online" | "transfer" | "onsite" | "taxReceipt";

/**
 * Champs qui manquent à une section **activée** pour qu'elle s'affiche (mêmes règles que
 * `toPublicGivingPage`) : sert au paramétrage à expliquer une section absente de l'aperçu.
 */
export function missingForDisplay(c: GivingPageContent): Partial<Record<GivingSection, string[]>> {
  const missing: Partial<Record<GivingSection, string[]>> = {};
  const check = (section: GivingSection, enabled: boolean, fields: [string | null, string][]) => {
    const labels = fields.filter(([value]) => !value).map(([, label]) => label);
    if (enabled && labels.length > 0) missing[section] = labels;
  };
  check("online", c.onlineEnabled, [[c.onlineUrl, "le lien de don en ligne"]]);
  check("transfer", c.transferEnabled, [[c.beneficiary, "le bénéficiaire"], [c.iban, "l'IBAN"]]);
  check("onsite", c.onsiteEnabled, [[c.checkPayee, "l'ordre des chèques"]]);
  check("taxReceipt", c.taxReceiptEnabled, [[c.taxReceiptText, "le texte"]]);
  return missing;
}

export { formatIban, normalizeIban, ibanError } from "./services/iban";
