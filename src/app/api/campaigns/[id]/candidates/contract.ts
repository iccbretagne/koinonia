import { defineContract } from "@/lib/openapi/contract";
import { candidatesQuerySchema } from "@/modules/campaigns/schemas";

export const contract = defineContract({
  GET: {
    summary: "Comptes de l'église à ajouter à une campagne",
    description: "Comptes ayant un rôle dans l'église de la campagne, filtrés par nom ou email (`q`), 20 au plus : pour ajouter un gestionnaire ou un répondant.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    query: candidatesQuerySchema,
    response: "Comptes : identifiant, nom, email",
  },
});
