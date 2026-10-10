import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const signSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

export const contract = defineContract({
  POST: {
    summary: "URL signée pour déposer la couverture par défaut",
    access: "audio:manage",
    body: signSchema,
    response: "`{ key, url, previewUrl }`",
  },
});
