import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  planningEventId: z.string().optional(),
  serviceDate: z.string().datetime().optional(),
  title: z.string().optional(),
  speaker: z.string().optional(),
  series: z.string().min(1).optional(),
  // Même contrainte que Event.type : EVENT_TYPES est une contrainte d'interface, pas serveur.
  type: z.string().min(1).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Cultes audio de l'église courante",
    access: "audio:view",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    query: z.object({
      status: z.string().optional().describe("Filtre par statut du culte"),
    }),
    response: "Cultes audio (file de production)",
  },
  POST: {
    summary: "Création d'un culte audio",
    description: "Rattaché à un événement du planning ou à une date de culte.",
    access: "audio:upload",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    body: createSchema,
    status: 201,
    response: "Culte audio créé",
  },
});
