import sharp from "sharp";
import { createElement } from "react";
import { Document, Image, Page, renderToBuffer } from "@react-pdf/renderer";
import { ApiError } from "@/lib/errors";
import { qrPath } from "@/lib/qr";
import { AGE_GROUP_LABEL } from "../schemas";
import { TICKET_FIELDS, TICKET_HEIGHT, TICKET_WIDTH, ticketImageIds, type TicketText, type TicketVisual } from "../ticket-visual-schemas";
import { getTicket } from "./booking";
import { hashToken } from "./tokens";
import { validateTicketVisual } from "./ticket-visual";

import { renderTicketV2, type TicketVariables } from "./ticket-render-v2";

const db = async () => (await import("@/lib/prisma")).prisma;
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export interface TicketVisualData { participant: string; date: string; location: string; address: string; qr: string; variables?: TicketVariables }

/** Texte borné par une boîte et une liste de polices, jamais de markup utilisateur. */
function textSvg(key: string, box: TicketText, text: string): string {
  const padding = 12;
  const maxWidth = box.width - padding * 2;
  const maxHeight = box.height - padding * 2;
  // Mesure conservatrice (un caractère peut occuper une em entière) et retour à la ligne.
  let fontSize = box.fontSize;
  const wrap = (size: number) => {
    const count = Math.max(1, Math.floor(maxWidth / size));
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      if (line && line.length + word.length + 1 > count) { lines.push(line); line = ""; }
      for (const char of word) {
        if (line.length >= count) { lines.push(line); line = ""; }
        line += char;
      }
      line += " ";
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  };
  let lines = wrap(fontSize);
  while (fontSize > 14 && lines.length * fontSize * 1.25 > maxHeight) lines = wrap(--fontSize);
  const limit = Math.max(1, Math.floor(maxHeight / (fontSize * 1.25)));
  if (lines.length > limit) lines = [...lines.slice(0, limit - 1), `${lines[limit - 1].slice(0, -1)}…`];
  return `<g transform="translate(${box.x} ${box.y})"><defs><clipPath id="${key}"><rect width="${box.width}" height="${box.height}"/></clipPath></defs><g clip-path="url(#${key})"><rect x="1" y="1" width="${box.width - 2}" height="${box.height - 2}" fill="${box.background ?? "none"}" stroke="${box.border ?? "none"}" stroke-width="2"/><text font-family="${box.font}" font-size="${fontSize}" fill="${box.color}">${lines.map((line, i) => `<tspan x="${padding}" y="${padding + fontSize + i * fontSize * 1.25}">${xml(line)}</tspan>`).join("")}</text></g></g>`;
}

/** Composition en PNG : aucune URL externe, uniquement des WebP de cet événement. */
export async function renderTicketVisual(doc: TicketVisual, data: TicketVisualData, images: Map<string, Buffer>): Promise<Buffer> {
  if (doc.version === 2) return renderTicketV2(doc, data.variables ?? legacyVariables(data), data.qr, images);
  const image = (id: string) => {
    const buffer = images.get(id);
    if (!buffer) throw new ApiError(409, "Une image du billet est indisponible");
    return buffer;
  };
  const layers: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [];
  for (const key of TICKET_FIELDS) {
    const box = doc[key];
    if (!box.visible) continue;
    if (box.mode === "image" && box.imageId) {
      layers.push({ input: await sharp(image(box.imageId)).resize(box.width, box.height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer(), left: box.x, top: box.y });
    } else {
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TICKET_WIDTH}" height="${TICKET_HEIGHT}">${textSvg(key, box, data[key])}</svg>`), left: 0, top: 0 });
    }
  }
  // Le QR est composé en dernier : aucune autre vignette ne peut le recouvrir. Marge de 4 modules.
  const qr = qrPath(data.qr);
  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.qr.size}" height="${doc.qr.size}" viewBox="-4 -4 ${qr.size + 8} ${qr.size + 8}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${qr.size + 8}" height="${qr.size + 8}" fill="white"/><path d="${qr.path}" fill="black"/></svg>`;
  layers.push({ input: Buffer.from(qrSvg), left: doc.qr.x, top: doc.qr.y });
  return sharp(image(doc.backgroundId)).resize(TICKET_WIDTH, TICKET_HEIGHT, { fit: "cover" }).composite(layers).png().toBuffer();
}

export async function ticketPng(eventId: string, doc: TicketVisual, data: TicketVisualData) {
  const rows = await (await db()).ticketingTicketImage.findMany({ where: { eventId, id: { in: ticketImageIds(doc) } }, select: { id: true, data: true } });
  return renderTicketVisual(doc, data, new Map(rows.map((r) => [r.id, Buffer.from(r.data)])));
}
function legacyVariables(data: TicketVisualData): TicketVariables {
  return { "participant.firstName": data.participant, "participant.lastName": "", "participant.name": data.participant, "ticket.category": "", "ticket.reference": "", "event.title": "", "event.date": data.date, "event.startTime": "", "event.endTime": "", "event.location": data.location, "event.address": data.address };
}
function eventText(event: { title?: string; startsAt: Date; endsAt?: Date; location: string | null; address: string | null }) {
  const format = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "Europe/Paris" }).format(date);
  return { date: format(event.startsAt, { dateStyle: "full", timeStyle: "short" }), location: event.location ?? "", address: event.address ?? "", eventVariables: { "event.title": event.title ?? "", "event.date": format(event.startsAt, { dateStyle: "full" }), "event.startTime": format(event.startsAt, { timeStyle: "short" }), "event.endTime": event.endsAt ? format(event.endsAt, { timeStyle: "short" }) : "", "event.location": event.location ?? "", "event.address": event.address ?? "" } };
}
export const TICKET_PREVIEW_NAMES = [
  ["Jean", "Koné"], ["Marie-Claire", "Ouattara"], ["Jean-Baptiste", "Kouamé N'Guessan"],
  ["Marie-Angélique Jean-Baptiste", "De la Roche Saint-André Kouamé N'Guessan Ouattara"],
] as const;
export async function previewTicketVisual(eventId: string, input: unknown, profile = 3, child = false) {
  const doc = await validateTicketVisual(eventId, input);
  const event = await (await db()).ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { title: true, startsAt: true, endsAt: true, location: true, address: true } });
  const data = eventText(event);
  const [first, last] = TICKET_PREVIEW_NAMES[profile] ?? TICKET_PREVIEW_NAMES[3];
  const category = child ? "Enfant" : "Adulte";
  const variables: TicketVariables = { ...data.eventVariables, "participant.firstName": first, "participant.lastName": last, "participant.name": `${first} ${last}`, "ticket.category": category, "ticket.reference": "EXEMPLE-0042" };
  return ticketPng(eventId, doc, { ...data, participant: `${first} ${last} · ${category} · Réservation EXEMPLE-0042`, qr: "https://example.org/billet/apercu-fictif-non-valable", variables });
}
export async function ticketVisualPdf(png: Buffer) {
  return renderToBuffer(createElement(Document, {}, createElement(Page, { size: [400, 600], style: { padding: 0 } }, createElement(Image, { src: { data: png, format: "png" }, style: { width: 400, height: 600 } }))));
}
export async function publicTicketVisual(token: string, format: "png" | "pdf") {
  const ticket = await getTicket(token);
  if (!ticket.valid) throw new ApiError(404, "Billet introuvable");
  const prisma = await db();
  const row = await prisma.ticketingParticipant.findUniqueOrThrow({ where: { ticketTokenHash: hashToken(token) }, select: { eventId: true, event: { select: { ticketVisualPublished: true, title: true, endsAt: true, startsAt: true, location: true, address: true } } } });
  if (!row.event.ticketVisualPublished) throw new ApiError(404, "Aucun visuel publié");
  const { ticketVisualSchema } = await import("../ticket-visual-schemas");
  const png = await ticketPng(row.eventId, ticketVisualSchema.parse(row.event.ticketVisualPublished), { ...eventText(row.event), participant: `${ticket.firstName} ${ticket.lastName} · ${AGE_GROUP_LABEL[ticket.ageGroup]} · Réservation ${ticket.reference}`, qr: ticket.qr, variables: { ...eventText(row.event).eventVariables, "participant.firstName": ticket.firstName, "participant.lastName": ticket.lastName, "participant.name": `${ticket.firstName} ${ticket.lastName}`, "ticket.category": AGE_GROUP_LABEL[ticket.ageGroup], "ticket.reference": ticket.reference } });
  // Revérifie après le rendu : ne livre pas un billet annulé pendant la composition.
  const active = await prisma.ticketingParticipant.findUnique({ where: { ticketTokenHash: hashToken(token) }, select: { status: true } });
  if (active?.status !== "ACTIVE") throw new ApiError(404, "Billet introuvable");
  return format === "pdf" ? ticketVisualPdf(png) : png;
}
