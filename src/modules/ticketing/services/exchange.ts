import { ApiError } from "@/lib/errors";
import { readPaymentMethods, type EventExport, type PaymentMethodsConfig } from "../schemas";
import { assetIdsOf, siteDocumentSchema, remapAssetIds } from "../site-schemas";
import { createEvent, getEventDetail, updateEvent, createOption } from "./events";
import { addVariant } from "./menu";
import { createPost } from "./team";
import { confirmAsset, copyAssets, decodeBase64Image, discardSiteAssets, exportAssets, stageAsset } from "./site-assets";
import { getSite, saveDraft, setAfterCloseDays } from "./site";

/**
 * Contenu transférable d'un événement (spec 084) : duplication dans l'église, export et import JSON
 * entre instances. Un seul chemin de création (`createFromContent`) pour les trois, qui passe par les
 * services de l'écran. Jamais d'inscrit, de paiement, de rôle ni d'affectation ; jamais d'IBAN.
 */

type Content = Pick<EventExport, "event" | "tariffs" | "options" | "variants" | "posts"> & {
  /** Moyens de paiement à poser sur la copie (sans IBAN). */
  paymentMethods: PaymentMethodsConfig;
};

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

/** Contenu de l'événement ; `export` réduit les moyens de paiement à espèces et chèque. */
async function readContent(eventId: string, mode: "duplicate" | "export"): Promise<Content> {
  const [detail, posts] = await Promise.all([getEventDetail(eventId), (await db()).ticketingPost.findMany({ where: { eventId }, orderBy: { position: "asc" } })]);
  const methods = readPaymentMethods(detail.paymentMethods);
  const paymentMethods: PaymentMethodsConfig = mode === "export" ? { cash: methods.cash, cheque: methods.cheque } : { ...methods, transfer: null };
  const optionKey = new Map(detail.options.map((o, i) => [o.id, `o${i + 1}`]));
  return {
    event: {
      title: detail.title,
      description: detail.description,
      location: detail.location,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
      registrationDeadline: detail.registrationDeadline,
      capacity: detail.capacity,
      seatsOpen: detail.seatsOpen,
      optionPaymentDeadline: detail.optionPaymentDeadline,
      reminderDaysBefore: detail.reminderDaysBefore,
      allowOnsitePayment: detail.allowOnsitePayment,
      allowUnaccompaniedMinors: detail.allowUnaccompaniedMinors,
      allowWalkIns: detail.allowWalkIns,
      entryRefundable: detail.entryRefundable,
      entryRefundDeadline: detail.entryRefundDeadline,
      questions: detail.questions,
      retentionDays: detail.retentionDays,
      paymentMethods: { cash: methods.cash, cheque: methods.cheque },
    },
    paymentMethods,
    tariffs: detail.tariffs,
    options: detail.options.map((o) => ({
      id: optionKey.get(o.id)!,
      label: o.label,
      description: o.description,
      type: o.type,
      scope: o.scope,
      price: o.price,
      stock: o.stock,
      pickup: o.pickup,
      namedPrep: o.namedPrep,
      refundable: o.refundable,
      refundDeadline: o.refundDeadline,
      active: o.active,
      position: o.position,
      choiceGroup: o.choiceGroup,
    })),
    variants: detail.options.flatMap((o) => o.variants.map((v) => ({ optionId: optionKey.get(o.id)!, label: v.label, description: v.description, allergens: v.allergens, stock: v.stock, position: v.position }))),
    posts: posts.map((p) => ({ name: p.name, position: p.position })),
  };
}

/** Crée l'événement (brouillon) et ses options, plats et postes dans l'église ; `overrides` : titre et dates. */
async function createFromContent(churchId: string, userId: string, content: Content, overrides: { title?: string; startsAt?: Date; endsAt?: Date } = {}) {
  const e = content.event;
  const event = await createEvent(churchId, userId, {
    title: overrides.title ?? e.title,
    startsAt: overrides.startsAt ?? e.startsAt,
    endsAt: overrides.endsAt ?? e.endsAt,
    capacity: e.capacity,
    description: e.description,
    location: e.location,
  });
  try {
    await updateEvent(event.id, userId, {
      seatsOpen: e.seatsOpen,
      registrationDeadline: e.registrationDeadline,
      optionPaymentDeadline: e.optionPaymentDeadline,
      reminderDaysBefore: e.reminderDaysBefore,
      allowOnsitePayment: e.allowOnsitePayment,
      allowUnaccompaniedMinors: e.allowUnaccompaniedMinors,
      allowWalkIns: e.allowWalkIns,
      entryRefundable: e.entryRefundable,
      entryRefundDeadline: e.entryRefundDeadline,
      questions: e.questions,
      retentionDays: e.retentionDays,
      tariffs: content.tariffs,
      paymentMethods: content.paymentMethods,
    });
    const created = new Map<string, string>();
    for (const o of [...content.options].sort((a, b) => a.position - b.position)) {
      const { id, ...fields } = o;
      created.set(id, (await createOption(event.id, userId, fields)).id);
    }
    for (const v of [...content.variants].sort((a, b) => a.position - b.position)) {
      const { optionId, ...fields } = v;
      await addVariant(event.id, created.get(optionId)!, userId, fields);
    }
    for (const p of [...content.posts].sort((a, b) => a.position - b.position)) await createPost(event.id, userId, p.name);
  } catch (error) {
    await discard(event.id);
    throw error;
  }
  return event;
}

/** Nettoyage d'une création interrompue : l'événement est un brouillon sans inscrit. */
async function discard(eventId: string) {
  const prisma = await db();
  const site = await prisma.ticketingSite.findUnique({ where: { eventId }, select: { id: true } });
  if (site) await discardSiteAssets(site.id).catch(() => undefined);
  await prisma.ticketingEvent.delete({ where: { id: eventId } }).catch(() => undefined);
}

export interface TransferSummary {
  options: number;
  variants: number;
  posts: number;
  images: number;
  site: boolean;
}
const summaryOf = (c: Content, images: number, site: boolean): TransferSummary => ({ options: c.options.length, variants: c.variants.length, posts: c.posts.length, images, site });

// ─── Duplication ─────────────────────────────────────────────────────────────

/**
 * Copie un événement de l'église en **brouillon** : paramétrage, jauge, tarifs, moyens de paiement
 * sans IBAN (à ressaisir), règles, options et plats, postes sans affectations, site (brouillon non
 * publié, images copiées). Les échéances suivent le décalage de date. Sans inscrit, paiement,
 * rôle ni affectation.
 */
export async function duplicateEvent(sourceId: string, churchId: string, userId: string, input: { title?: string; startsAt: Date; endsAt?: Date }) {
  const prisma = await db();
  const source = await prisma.ticketingEvent.findUnique({ where: { id: sourceId }, select: { churchId: true, title: true } });
  if (source?.churchId !== churchId) throw new ApiError(404, "Événement introuvable");
  const content = await readContent(sourceId, "duplicate");
  const delta = input.startsAt.getTime() - content.event.startsAt.getTime();
  const shift = (d: Date | null) => (d ? new Date(d.getTime() + delta) : null);
  const endsAt = input.endsAt ?? new Date(content.event.endsAt.getTime() + delta);
  const shifted: Content = {
    ...content,
    event: {
      ...content.event,
      registrationDeadline: shift(content.event.registrationDeadline),
      optionPaymentDeadline: shift(content.event.optionPaymentDeadline),
      entryRefundDeadline: shift(content.event.entryRefundDeadline),
    },
    options: content.options.map((o) => ({ ...o, refundDeadline: shift(o.refundDeadline) })),
  };
  const title = (input.title ?? `${source.title} (copie)`).slice(0, 150);
  const event = await createFromContent(churchId, userId, shifted, { title, startsAt: input.startsAt, endsAt });

  let images = 0;
  let site = false;
  try {
    const from = await prisma.ticketingSite.findUnique({ where: { eventId: sourceId } });
    if (from) {
      const target = await getSite(event.id);
      const map = await copyAssets(from.id, target.id);
      images = map.size;
      const doc = siteDocumentSchema.parse(from.draft);
      await saveDraft(event.id, userId, remapAssetIds(doc, map));
      await setAfterCloseDays(event.id, userId, from.afterCloseDays);
      site = true;
    }
  } catch (error) {
    await discard(event.id);
    throw error;
  }
  return { event, summary: summaryOf(shifted, images, site) };
}

// ─── Export ──────────────────────────────────────────────────────────────────

/** JSON versionné d'un événement : sans donnée personnelle, sans IBAN, images en WebP (1280 px au plus). */
/** État du site de l'événement source (publié ou non, brouillon modifié depuis), pour les résumés. */
export async function siteSourceState(eventId: string): Promise<{ exists: boolean; publishedAt: Date | null; draftChanged: boolean }> {
  const prisma = await db();
  const site = await prisma.ticketingSite.findUnique({ where: { eventId }, select: { draft: true, published: true, publishedAt: true } });
  if (!site) return { exists: false, publishedAt: null, draftChanged: false };
  const published = site.published ? site.publishedAt : null;
  return { exists: true, publishedAt: published, draftChanged: !!site.published && JSON.stringify(site.draft) !== JSON.stringify(site.published) };
}

export async function buildEventExport(eventId: string): Promise<Record<string, unknown>> {
  const prisma = await db();
  const content = await readContent(eventId, "export");
  const site = await prisma.ticketingSite.findUnique({ where: { eventId } });
  const document = site ? siteDocumentSchema.parse(site.draft) : null;
  const assets = site && document ? await exportAssets(site.id, [...assetIdsOf(document)]) : [];
  return {
    format: "koinonia-ticketing-event",
    version: 1,
    event: content.event,
    tariffs: content.tariffs,
    options: content.options,
    variants: content.variants,
    posts: content.posts,
    site: site && document ? { document, afterCloseDays: site.afterCloseDays } : null,
    assets,
  };
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Crée dans l'église un événement **en brouillon** (nouvelle adresse) depuis un export validé :
 * options, plats, postes, site. Chaque image repasse par le traitement des images du site
 * (type vérifié, dimensions, variantes, métadonnées retirées) ; les identifiants du document sont
 * remplacés par ceux des images créées.
 */
export async function importEvent(churchId: string, userId: string, data: EventExport) {
  const content: Content = { event: data.event, paymentMethods: data.event.paymentMethods, tariffs: data.tariffs, options: data.options, variants: data.variants, posts: data.posts };
  const event = await createFromContent(churchId, userId, content);
  let site = false;
  try {
    if (data.site) {
      const target = await getSite(event.id);
      const map = new Map<string, string>();
      for (const asset of data.assets) {
        const staged = await stageAsset(target.id, decodeBase64Image(asset.base64), { alt: asset.alt, name: asset.name });
        await confirmAsset(target.id, staged.id, userId);
        map.set(asset.id, staged.id);
      }
      await saveDraft(event.id, userId, remapAssetIds(data.site.document, map));
      await setAfterCloseDays(event.id, userId, data.site.afterCloseDays);
      site = true;
    }
  } catch (error) {
    await discard(event.id);
    throw error;
  }
  return { event, summary: summaryOf(content, site ? data.assets.length : 0, site) };
}

/** Résumé de ce qu'un import créerait, sans rien écrire. */
export function summarizeImport(data: EventExport): TransferSummary {
  return { options: data.options.length, variants: data.variants.length, posts: data.posts.length, images: data.site ? data.assets.length : 0, site: !!data.site };
}
