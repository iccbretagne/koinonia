import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
export const imageNameSchema = z.string().max(120);
export const contract = defineContract({
  GET: { summary: "Images du billet", access: "session", accessNote: "rôle de lecture sur l'événement", response: "`[{ id, name, width, height }]`" },
  POST: { summary: "Déposer une image du billet", access: "session", accessNote: "organisateur", body: { contentType: "multipart/form-data", description: "file (JPEG/PNG/WebP/SVG, 8 Mo au plus) et name facultatif (120 caractères)" }, response: "`{ id, name, width, height }`", description: "Type contrôlé sur le contenu, SVG rastérisé, WebP sans métadonnées ; 20 images au plus. Journalisé." },
});
