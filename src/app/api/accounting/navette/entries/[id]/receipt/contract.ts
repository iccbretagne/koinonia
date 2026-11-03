import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Justificatif d'une ligne du registre de la navette",
    description: "Servi par Koinonia (`nosniff`, cache privé), y compris pour une ligne supprimée (historique). 404 sans justificatif.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, dans l'église de la ligne",
    params: z.object({ id: z.string() }),
    response: "Image ou PDF",
    responseType: "application/octet-stream",
  },
});
