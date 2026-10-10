import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Parties déjà déposées d'un envoi multipart",
    description: "Permet de reprendre un envoi interrompu.",
    access: "audio:upload",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    query: z.object({
      sourceId: z.string(),
    }),
    response: "Parties déjà reçues par le stockage",
  },
});
