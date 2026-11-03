import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { noteSchema } from "@/modules/shuttle/schemas";

const params = z.object({ id: z.string() });

export const contract = defineContract({
  PUT: {
    summary: "Signalement d'une ligne par la comptabilité",
    description: "Pas un refus : la ligne reste comptée. Visible par l'équipe ; son auteur est prévenu. Journalisé.",
    access: "shuttle:manage",
    accessNote: "dans l'église de la ligne",
    params,
    body: noteSchema,
    response: "Ligne signalée",
  },
  DELETE: {
    summary: "Levée du signalement d'une ligne",
    access: "shuttle:manage",
    accessNote: "dans l'église de la ligne",
    params,
    response: "Ligne",
  },
});
