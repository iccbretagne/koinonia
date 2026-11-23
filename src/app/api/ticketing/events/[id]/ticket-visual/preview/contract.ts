import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { ticketVisualSchema } from "@/modules/ticketing/schemas";
export const previewSchema = ticketVisualSchema;
export const previewQuery = z.object({ profile: z.enum(["0", "1", "2", "3"]).default("3"), category: z.enum(["adult", "child"]).default("adult") });
export const contract = defineContract({
  GET: { summary: "Aperçu fictif du brouillon du billet", access: "session", accessNote: "rôle de lecture sur l'événement", query: previewQuery, response: "PNG", responseType: "image/png" },
  POST: { summary: "Aperçu sans enregistrement du visuel", access: "session", accessNote: "organisateur", body: previewSchema, query: previewQuery, response: "PNG", responseType: "image/png", description: "Documents V1/V2. Quatre noms fictifs et catégories adulte/enfant ; QR non valable. Une zone trop petite renvoie une erreur explicite sans troncature. 60 rendus par minute et par compte." },
});
