import { z } from "zod";

export const TICKET_WIDTH = 1000;
export const TICKET_HEIGHT = 1500;
export const TICKET_FIELDS = ["participant", "date", "location", "address"] as const;
export const TICKET_FONTS = ["sans-serif", "serif", "monospace"] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(40);
const box = z.object({ x: z.number().int().min(0).max(1000), y: z.number().int().min(0).max(1500), width: z.number().int().min(40).max(1000), height: z.number().int().min(40).max(1500) });
export const ticketTextSchema = box.extend({
  visible: z.boolean(),
  mode: z.enum(["text", "image"]),
  imageId: id.nullable(),
  font: z.enum(TICKET_FONTS),
  fontSize: z.number().int().min(14).max(100),
  color,
  background: color.nullable(),
  border: color.nullable(),
});
export const ticketVisualV1Schema = z.object({
  version: z.literal(1),
  backgroundId: id,
  qr: z.object({ x: z.number().int().min(0).max(820), y: z.number().int().min(0).max(1320), size: z.number().int().min(180).max(600) }),
  participant: ticketTextSchema,
  date: ticketTextSchema,
  location: ticketTextSchema,
  address: ticketTextSchema,
}).strict().superRefine((d, ctx) => {
  if (d.qr.x + d.qr.size > TICKET_WIDTH || d.qr.y + d.qr.size > TICKET_HEIGHT) ctx.addIssue({ code: "custom", path: ["qr"], message: "Le QR doit rester entièrement dans le billet" });
  for (const key of TICKET_FIELDS) {
    const b = d[key];
    if (b.x + b.width > TICKET_WIDTH || b.y + b.height > TICKET_HEIGHT) ctx.addIssue({ code: "custom", path: [key], message: "La vignette doit rester dans le billet" });
    if (key === "participant" && b.mode !== "text") ctx.addIssue({ code: "custom", path: [key], message: "Le nom du participant reste en mode texte" });
    if (b.mode === "image" && !b.imageId) ctx.addIssue({ code: "custom", path: [key, "imageId"], message: "Choisissez une image pour cette vignette" });
  }
});
export type TicketVisualV1 = z.infer<typeof ticketVisualV1Schema>;
export type TicketVisual = TicketVisualV1 | TicketVisualV2;
export type TicketText = z.infer<typeof ticketTextSchema>;
export function ticketImageIds(d: TicketVisual): string[] {
  if (d.version === 2) return [...new Set([...(d.backgroundId ? [d.backgroundId] : []), ...d.elements.flatMap((e) => e.type === "image" ? [e.imageId] : [])])];
  return [...new Set([d.backgroundId, ...TICKET_FIELDS.flatMap((k) => d[k].visible && d[k].mode === "image" && d[k].imageId ? [d[k].imageId!] : [])])];
}
export function defaultTicketVisual(backgroundId: string): TicketVisualV1 {
  const text = (y: number, height = 100): TicketText => ({ x: 70, y, width: 860, height, visible: true, mode: "text", imageId: null, font: "sans-serif", fontSize: 32, color: "#111111", background: "#ffffff", border: null });
  return { version: 1, backgroundId, qr: { x: 350, y: 1030, size: 300 }, participant: text(700, 150), date: text(370), location: text(480), address: text(590) };
}

// V2 reste dans les colonnes JSON existantes ; aucun modèle publié n'est converti implicitement.
export const TICKET_VARIABLES = ["participant.firstName", "participant.lastName", "participant.name", "ticket.category", "ticket.reference", "event.title", "event.date", "event.startTime", "event.endTime", "event.location", "event.address"] as const;
export const ticketTextStyleSchema = z.object({
  fontFamily: z.enum(TICKET_FONTS).default("sans-serif"),
  fontSize: z.number().int().min(14).max(200).default(48),
  minFontSize: z.number().int().min(14).max(200).default(20),
  fontWeight: z.enum(["normal", "bold"]).default("normal"),
  color: color.default("#111111"),
  background: color.nullable().default(null),
  border: color.nullable().default(null),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
  lineHeight: z.number().min(1).max(3).default(1.25),
  letterSpacing: z.number().min(-2).max(20).default(0),
  padding: z.number().int().min(0).max(100).default(12),
  autoFit: z.enum(["fixed", "shrink", "wrap"]).default("shrink"),
  maxLines: z.number().int().min(1).max(30).default(4),
}).strict();
const elementBox = box.extend({ id, name: z.string().max(100).default("Élément"), locked: z.boolean().default(false) });
export const ticketElementSchema = z.discriminatedUnion("type", [
  elementBox.extend({ type: z.literal("text"), content: z.string().max(2000), style: ticketTextStyleSchema }).strict(),
  elementBox.extend({ type: z.literal("image"), imageId: id }).strict(),
  elementBox.extend({ type: z.literal("qrCode") }).strict(),
  elementBox.extend({ type: z.literal("shape"), shape: z.enum(["rectangle", "circle", "line"]), color }).strict(),
]);
export const ticketVisualV2Schema = z.object({
  version: z.literal(2),
  canvas: z.object({ width: z.literal(1000), height: z.literal(1500) }).strict(),
  backgroundId: id.nullable(),
  backgroundColor: color,
  elements: z.array(ticketElementSchema).min(2).max(50),
}).strict().superRefine((d, ctx) => {
  const issue = (i: number, message: string) => ctx.addIssue({ code: "custom", path: ["elements", i], message });
  const qr = d.elements.filter((e) => e.type === "qrCode");
  if (qr.length !== 1) ctx.addIssue({ code: "custom", path: ["elements"], message: "Un QR officiel est obligatoire, et un seul" });
  const ids = new Set<string>();
  const participantFields = new Set<string>();
  if (d.elements.reduce((n, e) => n + (e.type === "text" ? e.content.length : 0), 0) > 10000) ctx.addIssue({ code: "custom", path: ["elements"], message: "10 000 caractères de texte au plus par billet" });
  d.elements.forEach((e, i) => {
    if (ids.has(e.id)) issue(i, "Identifiant dupliqué");
    ids.add(e.id);
    if (e.x + e.width > 1000 || e.y + e.height > 1500) issue(i, "La zone doit rester dans le billet");
    if (e.type === "qrCode" && (e.width !== e.height || e.width < 180 || e.width > 600)) issue(i, "QR carré de 180 à 600 px requis, marge blanche incluse");
    if (e.type === "shape" && e.shape === "circle" && e.width !== e.height) issue(i, "Un cercle doit avoir une largeur et une hauteur identiques");
    if (e.type === "text") {
      const variables = [...e.content.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
      if (variables.some((v) => !(TICKET_VARIABLES as readonly string[]).includes(v)) || e.content.replace(/\{[^{}]*\}/g, "").match(/[{}]/)) issue(i, "Variable inconnue ; utilisez uniquement les champs autorisés");
      variables.forEach((v) => participantFields.add(v));
      if (e.style.minFontSize > e.style.fontSize) issue(i, "La taille minimale dépasse la taille maximale");
      if (e.style.padding * 2 >= Math.min(e.width, e.height)) issue(i, "Marges internes trop grandes");
    }
    if (e.type === "text" || e.type === "image") {
      if (qr.some((q) => e.x < q.x + q.width && e.x + e.width > q.x && e.y < q.y + q.height && e.y + e.height > q.y)) issue(i, "La zone chevauche le QR et sa marge de silence");
    }
  });
  if (!participantFields.has("participant.name") && !(participantFields.has("participant.firstName") && participantFields.has("participant.lastName"))) ctx.addIssue({ code: "custom", path: ["elements"], message: "Le nom complet du participant doit rester un texte dynamique" });
});
export type TicketVisualV2 = z.infer<typeof ticketVisualV2Schema>;
export type TicketElement = z.infer<typeof ticketElementSchema>;
export type TicketTextStyle = z.infer<typeof ticketTextStyleSchema>;
export const ticketVisualSchema = z.discriminatedUnion("version", [ticketVisualV1Schema, ticketVisualV2Schema]);

export function convertTicketVisual(d: TicketVisualV1): TicketVisualV2 {
  const elements: TicketElement[] = TICKET_FIELDS.filter((k) => d[k].visible || k === "participant").map((k) => {
    const b = d[k];
    const base = { id: k, name: k, x: b.x, y: b.y, width: b.width, height: b.height, locked: false };
    return b.mode === "image" && b.imageId && k !== "participant" ? { ...base, type: "image", imageId: b.imageId } : {
      ...base, type: "text", content: { participant: "{participant.name} · {ticket.category} · Réservation {ticket.reference}", date: "{event.date} · {event.startTime}", location: "{event.location}", address: "{event.address}" }[k],
      style: ticketTextStyleSchema.parse({ fontFamily: b.font, fontSize: b.fontSize, minFontSize: 14, color: b.color, background: b.background, border: b.border }),
    };
  });
  elements.push({ id: "qr", name: "QR officiel", type: "qrCode", x: d.qr.x, y: d.qr.y, width: d.qr.size, height: d.qr.size, locked: false });
  return { version: 2, canvas: { width: 1000, height: 1500 }, backgroundId: d.backgroundId, backgroundColor: "#ffffff", elements };
}

export function defaultTicketVisualV2(): TicketVisualV2 {
  const text = (id: string, content: string, y: number, height: number, fontSize: number): TicketElement => ({ id, name: id, type: "text", content, x: 70, y, width: 860, height, locked: false, style: ticketTextStyleSchema.parse({ fontSize, color: "#f1dda5", textAlign: "center", verticalAlign: "middle", fontFamily: "serif" }) });
  return { version: 2, canvas: { width: 1000, height: 1500 }, backgroundId: null, backgroundColor: "#501e30", elements: [
    text("title", "{event.title}", 450, 150, 68),
    text("date", "{event.date} · {event.startTime}", 610, 100, 36),
    text("location", "{event.location}\n{event.address}", 720, 100, 32),
    { id: "qr", name: "QR officiel", type: "qrCode", x: 350, y: 850, width: 300, height: 300, locked: false },
    { id: "olive", name: "Panneau olive", type: "shape", shape: "rectangle", color: "#464e32", x: 50, y: 1200, width: 900, height: 250, locked: true },
    text("participant", "{participant.name}", 1210, 150, 56),
    text("reference", "{ticket.category} · {ticket.reference}", 1370, 60, 28),
  ] };
}
