import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { ticketVisualSchema } from "@/modules/ticketing/schemas";
export const saveSchema = z.object({ document: ticketVisualSchema, publish: z.boolean().default(false) }).strict();
export const contract = defineContract({
  GET: { summary: "Brouillon et publication du billet", access: "session", accessNote: "rôle de lecture sur l'événement", response: "`{ draft, published }`" },
  PUT: { summary: "Enregistrer ou publier le visuel du billet", access: "session", accessNote: "organisateur", body: saveSchema, response: "`{ draft, published }`", description: "Document validé et images de l'événement ; publication explicite, journalisée." },
  DELETE: { summary: "Retirer le visuel publié du billet", access: "session", accessNote: "organisateur", response: "`{ ok: true }`", description: "Le brouillon est conservé. Les billets reviennent à la présentation standard." },
});
