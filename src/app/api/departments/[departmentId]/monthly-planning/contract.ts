import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Planning mensuel d'un département",
    description: "Pour chaque événement du mois, les STAR en service (`EN_SERVICE` ou `EN_SERVICE_DEBRIEF`) avec leurs tâches assignées. Mois courant par défaut.",
    access: "planning:department",
    accessNote: "borné au périmètre départemental de l'appelant",
    query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Mois visé, au format AAAA-MM (mois courant par défaut)") }),
    response: "`{ events }` : événements du mois avec, pour chacun, les STAR en service et leurs tâches",
  },
});
