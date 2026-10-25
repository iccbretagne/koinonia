import { formatIban, normalizeIban, type GivingPageContent } from "@/modules/giving/schemas";
import type { StatusTone } from "@/components/ui/StatusChip";

type BoolKey = {
  [K in keyof GivingPageContent]: GivingPageContent[K] extends boolean ? K : never;
}[keyof GivingPageContent];
export type TextKey = Exclude<keyof GivingPageContent, BoolKey>;
/** Brouillon du formulaire : textes vides = chaîne vide, IBAN formaté par groupes de quatre. */
export type Draft = Record<BoolKey, boolean> & Record<TextKey, string>;

const BOOL_KEYS: ReadonlySet<string> = new Set<BoolKey>([
  "enabled", "onlineEnabled", "transferEnabled", "onsiteEnabled", "taxReceiptEnabled",
  "pageChurchNameShown", "slideChurchNameShown", "pageLogoShown", "slideLogoShown",
]);

export function toDraft(content: GivingPageContent): Draft {
  const draft = {} as Record<string, string | boolean>;
  for (const [key, value] of Object.entries(content)) {
    if (BOOL_KEYS.has(key)) draft[key] = Boolean(value);
    else if (key === "iban") draft[key] = value ? formatIban(String(value)) : "";
    else draft[key] = (value as string | null) ?? "";
  }
  return draft as Draft;
}

/** Contenu des aperçus : textes vides → absents, IBAN normalisé (sans validation bloquante). */
export function toPreviewContent(draft: Draft): GivingPageContent {
  const content = {} as Record<string, string | boolean | null>;
  for (const [key, value] of Object.entries(draft)) {
    if (typeof value === "boolean") content[key] = value;
    else content[key] = value.trim() === "" ? null : value.trim();
  }
  if (content.iban) content.iban = normalizeIban(String(content.iban));
  return content as unknown as GivingPageContent;
}

function comparable(key: string, value: string | boolean): string | boolean {
  if (typeof value === "boolean") return value;
  return key === "iban" ? normalizeIban(value.trim()) : value.trim();
}

/**
 * Le brouillon diffère-t-il de la dernière version enregistrée (spec 067) ? Espaces de début et
 * de fin ignorés (l'enregistrement les retire), IBAN comparé normalisé : un reformatage n'est pas
 * une modification.
 */
export function isDirty(draft: Draft, saved: Draft): boolean {
  return (Object.keys(saved) as (keyof Draft)[]).some(
    (key) => comparable(key, draft[key]) !== comparable(key, saved[key])
  );
}

export interface PublicationStatus {
  readonly tone: StatusTone;
  readonly label: string;
  /** Changement de publication en attente d'enregistrement, `null` sinon. */
  readonly pending: string | null;
}

/** Statut de la version enregistrée, et l'écart éventuel avec le brouillon (spec 067). */
export function publicationStatus(savedEnabled: boolean, draftEnabled: boolean): PublicationStatus {
  let pending: string | null = null;
  if (savedEnabled !== draftEnabled) {
    pending = draftEnabled ? "Sera publiée à l'enregistrement" : "Sera retirée à l'enregistrement";
  }
  return savedEnabled
    ? { tone: "success", label: "Publiée", pending }
    : { tone: "neutral", label: "Non publiée", pending };
}
