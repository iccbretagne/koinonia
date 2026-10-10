import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  sourceId: z.string().min(1),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) })).min(1),
});

export const contract = defineContract({
  POST: {
    summary: "Finalisation d'un dépôt multipart",
    description: "Déclenche l'analyse de la source par le worker audio.",
    access: "audio:upload",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    body: schema,
    response: "Source enregistrée",
  },
});
