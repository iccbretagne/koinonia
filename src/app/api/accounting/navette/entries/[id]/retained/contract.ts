import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { noteSchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  PUT: {
    summary: "Caution marquée non restituée",
    description: "Une caution versée jamais rendue (retenue pour un dommage…) sort des cautions en cours, avec un commentaire. Journalisé.",
    access: "shuttle:manage",
    accessNote: "dans l'église de la ligne",
    params: z.object({ id: z.string() }),
    body: noteSchema,
    response: "Ligne",
  },
});
