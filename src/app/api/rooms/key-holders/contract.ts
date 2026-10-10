import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Recherche de détenteurs de clés",
    description: "Autocomplétion d'utilisateurs de l'église pour la remise ou la réception des clés dans la main courante. Moins de 2 caractères : liste vide ; 10 résultats au plus.",
    access: "rooms:view",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      q: z.string().optional().describe("Nom ou nom d'affichage (2 caractères minimum)"),
    }),
    response: "Utilisateurs trouvés (`id`, `name`, `displayName`)",
  },
});
