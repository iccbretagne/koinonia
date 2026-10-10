import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  eventId: z.string(),
  // liste des memberId présents (les autres = absents)
  presentMemberIds: z.array(z.string()),
});

export const contract = defineContract({
  GET: {
    summary: "Présences d'un événement suivi",
    access: "discipleship:view",
    accessNote: "dans l'église de l'événement ; un Faiseur de Disciples ne voit que ses propres disciples",
    query: z.object({ eventId: z.string().describe("Événement visé") }),
    response: "Liste `{ memberId, present }`",
  },
  PUT: {
    summary: "Enregistrement des présences d'un événement suivi",
    description:
      "L'événement doit être suivi pour le discipolat (400 sinon). Les membres listés sont présents, tous les autres disciples absents. " +
      "Hors périmètre restreint, remplace toutes les présences de l'événement ; un Faiseur de Disciples ne met à jour que ses propres disciples. Journalisé.",
    access: "discipleship:manage",
    accessNote: "dans l'église de l'événement",
    body: schema,
    response: "`{ saved: true }`",
  },
});
