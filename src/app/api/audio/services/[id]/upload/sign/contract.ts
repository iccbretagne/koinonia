import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  kind: z.enum(["SEQUENCE", "MIX"]),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

export const contract = defineContract({
  POST: {
    summary: "URLs signées pour déposer une source audio",
    description: "Limité en débit. Le dépôt d'un mix entier à découper n'est pas encore disponible (400).",
    access: "audio:upload",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    body: schema,
    status: 201,
    response: "Source créée et URLs signées des parties",
  },
});
