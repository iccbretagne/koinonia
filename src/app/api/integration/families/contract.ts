import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Liste des familles d'intégration",
    description: "Relayée depuis le service externe des familles (mise en cache une heure) ; 502 si ce service est indisponible.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP, ou berger/co-berger d'une famille",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "`{ families }` : liste `{ id, name }` triée par nom",
  },
});
