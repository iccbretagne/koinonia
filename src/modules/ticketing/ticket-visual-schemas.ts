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
export const ticketVisualSchema = z.object({
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
export type TicketVisual = z.infer<typeof ticketVisualSchema>;
export type TicketText = z.infer<typeof ticketTextSchema>;
export function ticketImageIds(d: TicketVisual): string[] {
  return [...new Set([d.backgroundId, ...TICKET_FIELDS.flatMap((k) => d[k].visible && d[k].mode === "image" && d[k].imageId ? [d[k].imageId!] : [])])];
}
export function defaultTicketVisual(backgroundId: string): TicketVisual {
  const text = (y: number, height = 100): TicketText => ({ x: 70, y, width: 860, height, visible: true, mode: "text", imageId: null, font: "sans-serif", fontSize: 32, color: "#111111", background: "#ffffff", border: null });
  return { version: 1, backgroundId, qr: { x: 350, y: 1030, size: 300 }, participant: text(700, 150), date: text(370), location: text(480), address: text(590) };
}
