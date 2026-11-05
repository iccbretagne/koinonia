import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Historique d'une ligne de trésorerie",
    description: "Création, corrections (avant, après) et suppression, avec leur auteur et leur date, du plus récent au plus ancien.",
    access: "treasury:manage",
    accessNote: "dans l'église de la ligne",
    params: z.object({ id: z.string() }),
    response: "Historique",
  },
});
