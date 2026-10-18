import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { parseEmailList } from "@/lib/email";
import { ApiError } from "@/lib/api-utils";
import { toPublicGivingPage, type GivingPageContent, type GivingPageInput, type PublicGivingPage } from "../schemas";
import { defaultGivingContent } from "./defaults";
import { formatIban } from "./iban";
import { alertPaymentDetailsChange, type PaymentDetailsChange } from "./alerts";

const CONTENT_FIELDS = [
  "enabled", "intro",
  "onlineEnabled", "onlineUrl", "onlineDescription", "onlineNote",
  "transferEnabled", "beneficiary", "iban", "bic", "transferReference",
  "onsiteEnabled", "checkPayee", "onsiteText",
  "taxReceiptEnabled", "taxReceiptText",
  "verseText", "verseReference", "contactEmail", "address", "socialHandle",
  "shortUrl",
] as const satisfies readonly (keyof GivingPageContent)[];

/**
 * Coordonnées dont la modification déclenche une alerte (spec 065) : elles décident d'où part
 * l'argent. La désactivation de la page déclenche aussi l'alerte.
 */
const SENSITIVE_FIELDS: Readonly<Partial<Record<keyof GivingPageContent, string>>> = {
  beneficiary: "Bénéficiaire",
  iban: "IBAN",
  bic: "BIC",
  onlineUrl: "Lien de don en ligne",
  onlineEnabled: "Don en ligne affiché",
  transferEnabled: "Virement affiché",
};

function pickContent(row: Record<string, unknown>): GivingPageContent {
  return Object.fromEntries(CONTENT_FIELDS.map((k) => [k, row[k] ?? null])) as unknown as GivingPageContent;
}

function publicBaseUrl(): string {
  return (process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Adresse publique de la page de dons d'une église dans Koinonia. */
export function givingPublicUrl(slug: string): string {
  return `${publicBaseUrl()}/donner/${slug}`;
}

export interface GivingSettings {
  churchId: string;
  churchName: string;
  content: GivingPageContent;
  /** Ligne absente : la page n'a jamais été enregistrée, le contenu est celui proposé par défaut. */
  configured: boolean;
  hasAccountingEmails: boolean;
  publicUrl: string;
}

/** Paramètres de la page de dons d'une église, ou contenu proposé si jamais configurée. */
export async function getGivingSettings(churchId: string): Promise<GivingSettings> {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { id: true, name: true, slug: true, accountingEmails: true, givingPage: true },
  });
  if (!church) throw new ApiError(404, "Église introuvable");
  return {
    churchId: church.id,
    churchName: church.name,
    content: church.givingPage ? pickContent(church.givingPage) : defaultGivingContent(church.name),
    configured: church.givingPage !== null,
    hasAccountingEmails: parseEmailList(church.accountingEmails).length > 0,
    publicUrl: givingPublicUrl(church.slug),
  };
}

/**
 * Page publique d'une église, par son adresse. `null` dans les trois cas où rien ne doit être
 * montré (église inconnue, page jamais configurée, page désactivée), pour un seul message.
 */
export async function getPublicGivingPage(slug: string): Promise<PublicGivingPage | null> {
  const church = await prisma.church.findUnique({
    where: { slug },
    select: { name: true, givingPage: true },
  });
  if (!church?.givingPage?.enabled) return null;
  return toPublicGivingPage(church.name, pickContent(church.givingPage));
}

function display(field: keyof GivingPageContent, value: string | boolean | null | undefined): string {
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (!value) return "—";
  return field === "iban" ? formatIban(value) : value;
}

/** Différences entre l'état précédent (absent = rien) et le nouveau contenu. */
export function diffGivingContent(previous: GivingPageContent | null, next: GivingPageContent) {
  const changedFields = CONTENT_FIELDS.filter((k) => (previous ? previous[k] : null) !== next[k]);
  const sensitive: PaymentDetailsChange[] = [];
  for (const field of changedFields) {
    const label = SENSITIVE_FIELDS[field];
    // Une création sans coordonnée renseignée n'a rien à signaler.
    if (!label || (!previous && (next[field] === null || next[field] === false))) continue;
    sensitive.push({ label, before: display(field, previous?.[field]), after: display(field, next[field]) });
  }
  if (previous?.enabled && !next.enabled) sensitive.push({ label: "Page", before: "active", after: "désactivée" });
  return { changedFields, sensitive };
}

/**
 * Enregistre la page de dons d'une église (spec 065) : seul point d'écriture. Journalise toute
 * modification et alerte la comptabilité (ou les Admins) quand une coordonnée de paiement
 * change ou que la page est désactivée.
 */
export async function updateGivingPage(
  input: GivingPageInput,
  actor: { id: string; name: string }
): Promise<GivingPageContent> {
  const { churchId, ...content } = input;

  const { previous, saved, church } = await prisma.$transaction(async (tx) => {
    const church = await tx.church.findUnique({
      where: { id: churchId },
      select: { id: true, name: true, accountingEmails: true, givingPage: true },
    });
    if (!church) throw new ApiError(404, "Église introuvable");
    const saved = await tx.givingPage.upsert({
      where: { churchId },
      create: { churchId, ...content, updatedById: actor.id },
      update: { ...content, updatedById: actor.id },
    });
    return { previous: church.givingPage ? pickContent(church.givingPage) : null, saved, church };
  });

  const next = pickContent(saved);
  const { changedFields, sensitive } = diffGivingContent(previous, next);
  if (changedFields.length > 0) {
    await logAudit({
      userId: actor.id,
      churchId,
      action: previous ? "UPDATE" : "CREATE",
      entityType: "GivingPage",
      entityId: saved.id,
      details: { changedFields, alerted: sensitive.map((c) => c.label) },
    });
  }
  await alertPaymentDetailsChange(church, sensitive, actor);
  return next;
}
