import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const putSchema = z.object({
  eventId: z.string().min(1),
  content: z.string().max(2000),
});

export const contract = defineContract({
  GET: {
    summary: "Consigne d'un département pour un événement",
    access: "planning:department",
    accessNote: "borné au périmètre départemental de l'appelant",
    query: z.object({ eventId: z.string().describe("Événement visé") }),
    response: "Consigne (`content`, `updatedAt`, `authorName`), ou `null` s'il n'y en a pas",
  },
  PUT: {
    summary: "Enregistrement de la consigne d'un département pour un événement",
    description: "Crée ou remplace la consigne ; l'événement doit appartenir à la même église (404 sinon). Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental de l'appelant",
    body: putSchema,
    response: "`{ success: true }`",
  },
  DELETE: {
    summary: "Suppression de la consigne d'un département pour un événement",
    description: "404 si aucune consigne n'existe. Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental de l'appelant",
    query: z.object({ eventId: z.string().describe("Événement visé") }),
    response: "`{ success: true }`",
  },
});
