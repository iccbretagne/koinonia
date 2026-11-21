import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { RESERVED_SITE_SLUGS, normalizeHost, siteSlugFromHost } from "@/lib/site-host";
import { contrastIssues } from "../contrast";
import { assetIdsOf, defaultSiteDocument, siteDocumentSchema, type SiteDocument, type SiteTheme } from "../site-schemas";
import type { PublicEvent } from "../schemas";
import { getPublicEvent, slugify } from "./events";
import { getSitesEnabled } from "./site-settings";

/**
 * Site d'un événement (spec 084) : un document en brouillon et un instantané publié. Seul
 * l'instantané est servi au public, et seulement si l'église a activé les sites.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(userId: string, churchId: string, action: "CREATE" | "UPDATE", entityId: string, details?: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action, entityType: "TicketingSite", entityId, details });
}

/** Sous-domaine : lettres, chiffres, tirets, 63 caractères, jamais un mot réservé. */
export function siteSlugBase(eventSlug: string): string {
  const base = slugify(eventSlug).slice(0, 63).replace(/-+$/, "") || "evenement";
  return (RESERVED_SITE_SLUGS as readonly string[]).includes(base) ? `${base}-evenement` : base;
}

async function uniqueSiteSlug(eventSlug: string): Promise<string> {
  const prisma = await db();
  const base = siteSlugBase(eventSlug);
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const slug = `${base.slice(0, 63 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!(await prisma.ticketingSite.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new ApiError(409, "Adresse du site indisponible");
}

export interface SiteView {
  id: string;
  slug: string;
  draft: SiteDocument;
  published: boolean;
  publishedAt: string | null;
  afterCloseDays: number;
  issues: string[];
  updatedAt: string;
}

/** Site de l'événement ; créé au premier appel avec le document de départ. */
export async function getSite(eventId: string): Promise<SiteView> {
  const prisma = await db();
  let site = await prisma.ticketingSite.findUnique({ where: { eventId } });
  if (!site) {
    const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true, slug: true, title: true } });
    site = await prisma.ticketingSite.create({
      data: { eventId, churchId: event.churchId, slug: await uniqueSiteSlug(event.slug), draft: defaultSiteDocument(event.title) },
    });
  }
  const draft = siteDocumentSchema.parse(site.draft);
  return {
    id: site.id,
    slug: site.slug,
    draft,
    published: !!site.published,
    publishedAt: site.publishedAt?.toISOString() ?? null,
    afterCloseDays: site.afterCloseDays,
    issues: contrastIssues(draft).map((i) => i.message),
    updatedAt: site.updatedAt.toISOString(),
  };
}

/** Validation commune au brouillon et à la publication : schéma, lisibilité, images du site. */
async function validate(siteId: string, input: unknown): Promise<SiteDocument> {
  const doc = siteDocumentSchema.parse(input);
  const issues = contrastIssues(doc);
  if (issues.length) throw new ApiError(400, issues.map((i) => i.message).join(" "));
  const ids = [...assetIdsOf(doc)];
  if (ids.length) {
    const own = await (await db()).ticketingSiteAsset.findMany({ where: { siteId, id: { in: ids } }, select: { id: true } });
    if (own.length !== ids.length) throw new ApiError(400, "Une image n'appartient pas à ce site");
  }
  return doc;
}

export async function saveDraft(eventId: string, userId: string, input: unknown): Promise<SiteView> {
  const site = await getSite(eventId);
  const doc = await validate(site.id, input);
  const prisma = await db();
  const row = await prisma.ticketingSite.update({ where: { id: site.id }, data: { draft: doc } });
  await audit(userId, row.churchId, "UPDATE", site.id, { draft: true });
  return getSite(eventId);
}

/** Durée d'affichage de « Événement terminé » après la clôture, en jours. */
export async function setAfterCloseDays(eventId: string, userId: string, days: number): Promise<SiteView> {
  const site = await getSite(eventId);
  const row = await (await db()).ticketingSite.update({ where: { id: site.id }, data: { afterCloseDays: days } });
  await audit(userId, row.churchId, "UPDATE", site.id, { afterCloseDays: days });
  return getSite(eventId);
}

export async function publish(eventId: string, userId: string): Promise<SiteView> {
  const prisma = await db();
  const site = await prisma.ticketingSite.findUniqueOrThrow({ where: { eventId } });
  const doc = await validate(site.id, site.draft);
  await prisma.ticketingSite.update({ where: { id: site.id }, data: { published: doc, publishedAt: new Date(), publishedById: userId } });
  await audit(userId, site.churchId, "UPDATE", site.id, { published: true });
  return getSite(eventId);
}

export async function unpublish(eventId: string, userId: string): Promise<SiteView> {
  const prisma = await db();
  const site = await prisma.ticketingSite.findUniqueOrThrow({ where: { eventId } });
  await prisma.ticketingSite.update({ where: { id: site.id }, data: { published: Prisma.DbNull, publishedAt: null, publishedById: null } });
  await audit(userId, site.churchId, "UPDATE", site.id, { published: false });
  return getSite(eventId);
}

/** Site servi pour un hôte : sous-domaine de `SITE_BASE_DOMAIN`, ou domaine dédié approuvé. */
export async function resolveSiteByHost(host: string): Promise<{ slug: string } | null> {
  const prisma = await db();
  const sub = siteSlugFromHost(host, process.env.SITE_BASE_DOMAIN);
  if (sub) {
    const site = await prisma.ticketingSite.findUnique({ where: { slug: sub }, select: { slug: true } });
    return site ? { slug: site.slug } : null;
  }
  const domain = await prisma.ticketingSiteDomain.findFirst({ where: { host: normalizeHost(host), status: "APPROVED" }, select: { site: { select: { slug: true } } } });
  return domain ? { slug: domain.site.slug } : null;
}

export interface PublicSiteView {
  document: SiteDocument;
  /** `null` une fois l'événement clôturé (le site n'affiche alors que « Événement terminé »). */
  event: PublicEvent | null;
  ended: boolean;
  title: string;
  churchSlug: string;
  eventSlug: string;
  churchName: string;
  afterCloseDays: number;
}

/** Ce que le public voit, ou `null` (404) : église coupée, non publié, brouillon, trop ancien. */
export async function publicSiteView(slug: string, now: Date = new Date()): Promise<PublicSiteView | null> {
  const prisma = await db();
  const site = await prisma.ticketingSite.findUnique({
    where: { slug },
    include: { event: { select: { slug: true, title: true, status: true, closedAt: true, church: { select: { slug: true, name: true } } } } },
  });
  if (!site?.published || !site.event.church.slug) return null;
  if (!(await getSitesEnabled(site.churchId))) return null;
  const { event } = site;
  if (event.status === "DRAFT") return null;
  const parsed = siteDocumentSchema.safeParse(site.published);
  if (!parsed.success) return null;
  const base = { document: parsed.data, title: event.title, churchSlug: event.church.slug, eventSlug: event.slug, churchName: event.church.name, afterCloseDays: site.afterCloseDays };
  if (event.status === "ARCHIVED") {
    const closedAt = event.closedAt ?? site.updatedAt;
    if (now.getTime() > closedAt.getTime() + site.afterCloseDays * DAY_MS) return null;
    return { ...base, event: null, ended: true };
  }
  const publicEvent = await getPublicEvent(event.church.slug, event.slug);
  return publicEvent ? { ...base, event: publicEvent, ended: false } : null;
}

/** Données de l'événement pour l'aperçu de l'éditeur, quel que soit son état (équipe seulement). */
export async function previewEvent(eventId: string): Promise<PublicEvent | null> {
  const event = await (await db()).ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { slug: true, church: { select: { slug: true } } } });
  return event.church.slug ? getPublicEvent(event.church.slug, event.slug, true) : null;
}

/** Thème du site **publié** d'un événement, pour la page d'inscription ; `null` sans site visible. */
export async function publishedTheme(churchSlug: string, eventSlug: string): Promise<SiteTheme | null> {
  const site = await (await db()).ticketingSite.findFirst({
    where: { event: { slug: eventSlug, church: { slug: churchSlug }, status: { not: "DRAFT" } }, published: { not: Prisma.DbNull } },
    select: { churchId: true, published: true },
  });
  if (!site || !(await getSitesEnabled(site.churchId))) return null;
  const parsed = siteDocumentSchema.safeParse(site.published);
  return parsed.success ? parsed.data.theme : null;
}
