import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Historique d'une ligne du registre de la navette",
    description: "Créations, corrections (valeurs avant et après), suppression, signalements et demandes de remboursement, du plus récent au plus ancien.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, dans l'église de la ligne",
    params: z.object({ id: z.string() }),
    response: "Historique",
  },
});
