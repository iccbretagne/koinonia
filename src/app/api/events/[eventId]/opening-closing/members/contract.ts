import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Recherche de membres pour l'ouverture et la fermeture",
    description: "Tout membre de l'église, sans borne départementale (spec 041) ; 25 résultats au plus, triés par nom.",
    access: "planning:view",
    accessNote: "et droit de désigner ce service : Super Admin, Admin, Secrétaire, responsable d'un département Sécurité ou membre d'un département Secrétariat (403 sinon)",
    query: z.object({ q: z.string().optional().describe("Fragment de prénom ou de nom") }),
    response: "Liste de `{ id, firstName, lastName }`",
  },
});
