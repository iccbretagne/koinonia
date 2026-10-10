import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'une désignation d'ouverture ou de fermeture",
    description: "Le membre retiré est notifié.",
    access: "planning:view",
    accessNote: "et droit de désigner ce service : Super Admin, Admin, Secrétaire, responsable d'un département Sécurité ou membre d'un département Secrétariat (403 sinon)",
    response: "`{ success: true }`",
  },
});
