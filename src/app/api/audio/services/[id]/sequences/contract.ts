import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  sequences: z.array(
    z.object({
      sourceId: z.string().min(1),
      order: z.number().int().nonnegative(),
      title: z.string().min(1),
    })
  ),
});

export const contract = defineContract({
  PUT: {
    summary: "Nommage et ordre des séquences",
    access: "audio:review",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    body: schema,
    response: "Séquences du culte",
  },
});
