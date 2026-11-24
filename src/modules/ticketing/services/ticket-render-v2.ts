import sharp from "sharp";
import { ApiError } from "@/lib/errors";
import { qrPath } from "@/lib/qr";
import { type TicketVisualV2, type TICKET_VARIABLES } from "../ticket-visual-schemas";
import { layoutTicketText, pangoText } from "./ticket-text-layout";

export type TicketVariables = Record<(typeof TICKET_VARIABLES)[number], string>;
export function resolveTicketText(content: string, values: TicketVariables) {
  return content.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new ApiError(400, `Variable inconnue : ${key}`);
    return values[key as keyof TicketVariables];
  });
}
export async function renderTicketV2(doc: TicketVisualV2, values: TicketVariables, payload: string, images: Map<string, Buffer>) {
  const image = (id: string) => { const value = images.get(id); if (!value) throw new ApiError(409, "Une image du billet est indisponible"); return value; };
  const layers: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [];
  for (const e of doc.elements) {
    if (e.type === "qrCode") continue;
    if (e.type === "text") {
      let layout;
      try { layout = await layoutTicketText(resolveTicketText(e.content, values), e.width, e.height, e.style); }
      catch (error) { if (error instanceof ApiError) throw new ApiError(422, `${e.name} : ${error.message}`); throw error; }
      if (e.style.background || e.style.border) layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${e.width}" height="${e.height}"><rect x="1" y="1" width="${e.width - 2}" height="${e.height - 2}" fill="${e.style.background ?? "none"}" stroke="${e.style.border ?? "none"}" stroke-width="2"/></svg>`), left: e.x, top: e.y });
      for (const line of layout.lines) if (line.text.trim()) layers.push({ input: await sharp({ text: pangoText(line.text, e.style, layout.fontSize) }).png().toBuffer(), left: e.x + line.x, top: e.y + line.y });
    } else if (e.type === "image") {
      layers.push({ input: await sharp(image(e.imageId)).resize(e.width, e.height, { fit: "contain", background: "#00000000" }).png().toBuffer(), left: e.x, top: e.y });
    } else {
      const shape = e.shape === "circle" ? `<ellipse cx="${e.width / 2}" cy="${e.height / 2}" rx="${e.width / 2}" ry="${e.height / 2}" fill="${e.color}"/>` : e.shape === "line" ? `<path d="M0 ${e.height / 2} H${e.width}" stroke="${e.color}" stroke-width="2"/>` : `<rect width="100%" height="100%" fill="${e.color}"/>`;
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${e.width}" height="${e.height}">${shape}</svg>`), left: e.x, top: e.y });
    }
  }
  // QR métier inchangé, composé en dernier avec quatre modules blancs de silence.
  const e = doc.elements.find((e) => e.type === "qrCode")!;
  const qr = qrPath(payload);
  layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${e.width}" height="${e.height}" viewBox="-4 -4 ${qr.size + 8} ${qr.size + 8}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${qr.size + 8}" height="${qr.size + 8}" fill="white"/><path d="${qr.path}" fill="black"/></svg>`), left: e.x, top: e.y });
  const base = doc.backgroundId ? sharp(image(doc.backgroundId)).resize(1000, 1500, { fit: "cover" }) : sharp({ create: { width: 1000, height: 1500, channels: 4, background: doc.backgroundColor } });
  return base.composite(layers).png().toBuffer();
}
