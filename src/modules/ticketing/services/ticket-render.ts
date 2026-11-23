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

const db = async () => (await import("@/lib/prisma")).prisma;
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export interface TicketVisualData { participant: string; date: string; location: string; address: string; qr: string }

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
function eventText(event: { startsAt: Date; location: string | null; address: string | null }) {
  return { date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(event.startsAt), location: event.location ?? "", address: event.address ?? "" };
}
export async function previewTicketVisual(eventId: string, input: unknown) {
  const doc = await validateTicketVisual(eventId, input);
  const event = await (await db()).ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { startsAt: true, location: true, address: true } });
  return ticketPng(eventId, doc, { ...eventText(event), participant: "Marie-Angélique De la Roche Saint-André · Adulte · Réservation EXEMPLE-0042", qr: "https://example.org/billet/apercu-fictif-non-valable" });
}
export async function ticketVisualPdf(png: Buffer) {
  return renderToBuffer(createElement(Document, {}, createElement(Page, { size: [400, 600], style: { padding: 0 } }, createElement(Image, { src: { data: png, format: "png" }, style: { width: 400, height: 600 } }))));
}
export async function publicTicketVisual(token: string, format: "png" | "pdf") {
  const ticket = await getTicket(token);
  if (!ticket.valid) throw new ApiError(404, "Billet introuvable");
  const prisma = await db();
  const row = await prisma.ticketingParticipant.findUniqueOrThrow({ where: { ticketTokenHash: hashToken(token) }, select: { eventId: true, event: { select: { ticketVisualPublished: true, startsAt: true, location: true, address: true } } } });
  if (!row.event.ticketVisualPublished) throw new ApiError(404, "Aucun visuel publié");
  const { ticketVisualSchema } = await import("../ticket-visual-schemas");
  const png = await ticketPng(row.eventId, ticketVisualSchema.parse(row.event.ticketVisualPublished), { ...eventText(row.event), participant: `${ticket.firstName} ${ticket.lastName} · ${AGE_GROUP_LABEL[ticket.ageGroup]} · Réservation ${ticket.reference}`, qr: ticket.qr });
  // Revérifie après le rendu : ne livre pas un billet annulé pendant la composition.
  const active = await prisma.ticketingParticipant.findUnique({ where: { ticketTokenHash: hashToken(token) }, select: { status: true } });
  if (active?.status !== "ACTIVE") throw new ApiError(404, "Billet introuvable");
  return format === "pdf" ? ticketVisualPdf(png) : png;
}
