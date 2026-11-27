import { z } from "zod";
import { publicOrigin } from "@/modules/mcp";
import { ticketVisualSchema } from "@/modules/ticketing/schemas";
import { safeFetchImage } from "@/lib/safe-fetch";
import { eventAction, eventFor, eventRef } from "./ticketing";
import { refusal, type McpActionDef } from "./common";
import { paths } from "@/lib/paths";

const ticketing = () => import("@/modules/ticketing");
const input = z.object({ event: eventRef });
const reads: McpActionDef[] = [{
  name: "ticketing_ticket_visual", action: "ticketing_ticket_visual", kind: "read",
  description: "Visuel du billet : brouillon, publication, images et adresse de l'éditeur avec aperçu fictif. Indépendant du site. Aucune modification par cet outil. Ne prétendez appliquer un visuel qu'après une confirmation réussie.",
  input,
  available: (v) => v.modules.includes("ticketing") && v.predicates.includes("ticketing"),
  run: async (raw, ctx) => {
    const value = raw as z.infer<typeof input>;
    const event = await eventFor(ctx, value.event, "read");
    if (typeof event === "string") return refusal(event);
    const m = await ticketing();
    const [visual, images] = await Promise.all([m.getTicketVisual(event.id), m.listTicketImages(event.id)]);
    const editor = `${publicOrigin()}${paths.billetterie.event(event.id, { vue: "billet" })}`;
    return { text: `Visuel du billet de « ${event.title} » : ${visual.published ? "publié" : "non publié"}.\nÉditeur et dépôt d'images : ${editor}\n${JSON.stringify({ ...visual, images })}\nLes images fixes de date/lieu/adresse ne suivent pas les changements de l'événement. Le nom reste en texte, le QR est toujours généré.`, structured: { ...visual, images, editor } };
  },
}];
const upload = eventAction({
  action: "upload_ticketing_ticket_image", role: "configure",
  description: "Aperçu d'un dépôt d'image du billet (fond ou vignette) : exactement une source (fichier du client, URL https publique, base64). JPEG/PNG/WebP/SVG, 8 Mo au plus, réencodé en WebP. Montrez le résumé et attendez l'accord explicite avant confirmation. Si le fichier est inaccessible, proposez le lien de l'éditeur de ticketing_ticket_visual. Le dépôt ne publie rien.",
  confirmDescription: "Confirmer le dépôt de l'image du billet après accord explicite ; renvoie son identifiant à placer dans le document.",
  meta: { "openai/fileParams": ["file"] },
  input: z.object({ event: eventRef, name: z.string().max(120).default("Image du billet"), file: z.object({ download_url: z.string().url(), file_id: z.string(), mime_type: z.string().optional(), file_name: z.string().optional() }).strict().optional(), source: z.union([z.object({ url: z.string().url() }).strict(), z.object({ base64: z.string().min(1).max(11_500_000) }).strict()]).optional() }),
  prepare: async (i, _ctx, event) => {
    if (Boolean(i.file) === Boolean(i.source)) return "Fournissez exactement une source : file ou source.";
    const m = await ticketing();
    const buffer = i.file ? await safeFetchImage(i.file.download_url) : "url" in i.source! ? await safeFetchImage(i.source.url) : m.decodeBase64Image(i.source!.base64);
    const prepared = await m.prepareTicketImage(buffer);
    return { lines: [`Ajouter l'image « ${i.name} » au billet de « ${event!.title} » (${prepared.width} × ${prepared.height}). Aucun visuel n'est publié.`], payload: { eventId: event!.id, name: i.name, base64: prepared.base64 } };
  },
  state: async (p) => (await ticketing()).listTicketImages(p.eventId),
  execute: async (p, ctx) => {
    const image = await (await ticketing()).addTicketImage(p.eventId, ctx.viewer.userId, Buffer.from(p.base64, "base64"), p.name);
    return { text: `Image du billet ajoutée : ${image.id}. Placez-la dans le document, puis publiez après aperçu et confirmation.`, vue: "billet", structured: { image } };
  },
});
const edit = eventAction({
  action: "edit_ticketing_ticket_visual", role: "configure",
  description: "Aperçu du visuel du billet : document complet V1 ou V2 à éléments indépendants et variables autorisées (surface 1000 × 1500, fond facultatif en V2, portrait >= 600 px si utilisé ; QR obligatoire carré >= 180 px, nom toujours texte). publish=false enregistre seulement le brouillon ; true publie sur tous les billets existants. Images de cet événement seulement. Montrez résumé et lien d'aperçu, attendez l'accord explicite.",
  confirmDescription: "Enregistrer/publier le visuel du billet après accord explicite, avec le jeton de l'aperçu ; droits et état revérifiés.",
  input: z.object({ event: eventRef, document: ticketVisualSchema, publish: z.boolean().default(false) }),
  prepare: async (i, _ctx, event) => {
    const m = await ticketing();
    const document = await m.validateTicketVisual(event!.id, i.document);
    // Exécute aussi le rendu, comme l'écran, avant de proposer une publication.
    await m.previewTicketVisual(event!.id, document);
    return { lines: [`${i.publish ? "Publier sur tous les billets" : "Enregistrer le brouillon"} de « ${event!.title} ».`, document.version === 1 ? `Fond ${document.backgroundId} ; QR ${document.qr.size} px à (${document.qr.x}, ${document.qr.y}).` : `Document V2 : ${document.elements.length} éléments ; QR officiel et textes dynamiques.`, "Les images fixes ne suivent pas les changements d'événement.", `Éditeur : ${publicOrigin()}${paths.billetterie.event(event!.id, { vue: "billet" })}`], payload: { eventId: event!.id, document, publish: i.publish ?? false }, structured: { document } };
  },
  state: async (p) => {
    const m = await ticketing();
    const e = await m.getEventDetail(p.eventId);
    return { visual: await m.getTicketVisual(p.eventId), images: await m.listTicketImages(p.eventId), title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location, address: e.address };
  },
  execute: async (p, ctx) => {
    await (await ticketing()).saveTicketVisual(p.eventId, ctx.viewer.userId, p.document, p.publish);
    return { text: p.publish ? "Visuel publié : les billets utilisent maintenant ce visuel." : "Brouillon enregistré. Les billets restent inchangés jusqu'à publication.", vue: "billet" };
  },
});
const remove = eventAction({
  action: "unpublish_ticketing_ticket_visual", role: "configure",
  description: "Aperçu : retirer le visuel publié des billets (brouillon conservé), revenir au billet standard. Attendez l'accord explicite avant confirmation.",
  confirmDescription: "Retirer le visuel publié après accord explicite.", input,
  prepare: async (_i, _ctx, event) => ({ lines: [`Retirer le visuel du billet de « ${event!.title} ». Les billets reviennent à la présentation standard, sans nouvel email.`], payload: { eventId: event!.id } }),
  state: async (p) => (await ticketing()).getTicketVisual(p.eventId),
  execute: async (p, ctx) => { await (await ticketing()).unpublishTicketVisual(p.eventId, ctx.viewer.userId); return { text: "Visuel retiré des billets.", vue: "billet" }; },
});
export const TICKET_VISUAL_ACTIONS: McpActionDef[] = [...reads, ...upload, ...edit, ...remove];
