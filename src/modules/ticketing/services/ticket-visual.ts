import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { processImage } from "./site-assets";
import { ticketVisualSchema, ticketImageIds, type TicketVisual } from "../ticket-visual-schemas";

const db = async () => (await import("@/lib/prisma")).prisma;
const parse = (v: unknown) => v ? ticketVisualSchema.parse(v) : null;
export async function getTicketVisual(eventId: string) {
  const event = await (await db()).ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { ticketVisualDraft: true, ticketVisualPublished: true } });
  return { draft: parse(event.ticketVisualDraft), published: parse(event.ticketVisualPublished) };
}
export async function listTicketImages(eventId: string) {
  return (await db()).ticketingTicketImage.findMany({ where: { eventId }, select: { id: true, name: true, width: true, height: true }, orderBy: { createdAt: "asc" } });
}
export async function readTicketImage(eventId: string, id: string) {
  return (await db()).ticketingTicketImage.findFirst({ where: { id, eventId } });
}
/** Le traitement est partagé avec les images du site ; jamais de source brute en base. */
export async function prepareTicketImage(buffer: Buffer) {
  const processed = await processImage(buffer);
  const largest = processed.variants[processed.variants.length - 1];
  // Borne aussi le résultat stocké (et les payloads d'aperçu MCP).
  if (largest.data.length > 3 * 1024 * 1024) throw new ApiError(400, "Image réencodée trop lourde (3 Mo au plus)");
  return { width: processed.width, height: processed.height, base64: largest.data.toString("base64") };
}
export async function addTicketImage(eventId: string, userId: string, buffer: Buffer, name: string) {
  const image = await prepareTicketImage(buffer);
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true } });
  const row = await prisma.$transaction(async (tx) => {
    // Sérialise les dépôts et les documents pour garder la limite et les références cohérentes.
    await tx.$queryRaw`SELECT id FROM ticketing_events WHERE id = ${eventId} FOR UPDATE`;
    if (await tx.ticketingTicketImage.count({ where: { eventId } }) >= 20) throw new ApiError(400, "20 images au plus : retirez une image inutilisée");
    return tx.ticketingTicketImage.create({ data: { eventId, name: name.replace(/[\u0000-\u001f]/g, " ").slice(0, 120), width: image.width, height: image.height, data: Buffer.from(image.base64, "base64") }, select: { id: true, name: true, width: true, height: true } });
  });
  await logAudit({ userId, churchId: event.churchId, action: "CREATE", entityType: "TicketingTicketImage", entityId: row.id });
  return row;
}
export async function validateTicketVisual(eventId: string, input: unknown): Promise<TicketVisual> {
  const doc = ticketVisualSchema.parse(input);
  const images = await (await db()).ticketingTicketImage.findMany({ where: { eventId, id: { in: ticketImageIds(doc) } }, select: { id: true, width: true, height: true } });
  if (ticketImageIds(doc).some((id) => !images.some((a) => a.id === id))) throw new ApiError(400, "Une image n'appartient pas à cet événement ou a été supprimée");
  const bg = images.find((a) => a.id === doc.backgroundId);
  if (bg && (bg.height <= bg.width || bg.width < 600)) throw new ApiError(400, "Le fond doit être au format portrait, de 600 px de large au moins");
  return doc;
}
export async function saveTicketVisual(eventId: string, userId: string, input: unknown, publish = false) {
  const prisma = await db();
  const doc = await validateTicketVisual(eventId, input);
  if (doc.version === 2) {
    // Le même moteur serveur protège aussi les sauvegardes directes API/MCP.
    const { previewTicketVisual } = await import("./ticket-render");
    await previewTicketVisual(eventId, doc);
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ticketing_events WHERE id = ${eventId} FOR UPDATE`;
    const ids = ticketImageIds(doc);
    if (await tx.ticketingTicketImage.count({ where: { eventId, id: { in: ids } } }) !== ids.length) throw new ApiError(409, "Une image a été supprimée : rechargez l'éditeur");
    await tx.ticketingEvent.update({ where: { id: eventId }, data: { ticketVisualDraft: doc, ...(publish ? { ticketVisualPublished: doc } : {}) } });
  });
  await audit(eventId, userId, publish ? "publish" : "draft");
  return getTicketVisual(eventId);
}
export async function unpublishTicketVisual(eventId: string, userId: string) {
  await (await db()).ticketingEvent.update({ where: { id: eventId }, data: { ticketVisualPublished: Prisma.DbNull } });
  await audit(eventId, userId, "unpublish");
}
export async function deleteTicketImage(eventId: string, userId: string, imageId: string) {
  const prisma = await db();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ticketing_events WHERE id = ${eventId} FOR UPDATE`;
    const event = await tx.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { ticketVisualDraft: true, ticketVisualPublished: true } });
    if ([parse(event.ticketVisualDraft), parse(event.ticketVisualPublished)].some((d) => d && ticketImageIds(d).includes(imageId))) throw new ApiError(409, "Image utilisée par le brouillon ou le visuel publié");
    const deleted = await tx.ticketingTicketImage.deleteMany({ where: { id: imageId, eventId } });
    if (!deleted.count) throw new ApiError(404, "Image introuvable");
  });
  await audit(eventId, userId, "deleteImage");
}
async function audit(eventId: string, userId: string, operation: string) {
  const event = await (await db()).ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true } });
  await logAudit({ userId, churchId: event.churchId, action: "UPDATE", entityType: "TicketingTicketVisual", entityId: eventId, details: { operation } });
}
