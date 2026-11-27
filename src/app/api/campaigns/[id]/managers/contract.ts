import { defineContract } from "@/lib/openapi/contract";
import { managerAddSchema } from "@/modules/campaigns/schemas";

export { managerAddSchema };

export const contract = defineContract({
  GET: {
    summary: "Gestionnaires d'une campagne",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    response: "Gestionnaires : compte, nom, email, ajouté le, ajouté par",
  },
  POST: {
    summary: "Ajout d'un gestionnaire",
    description: "Un compte ayant un rôle dans l'église de la campagne (400 sinon). Idempotent. Le gestionnaire voit tout le contenu de la campagne, questionnaires confidentiels compris. Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    body: managerAddSchema,
    response: "`{ created }`",
    status: 201,
  },
});
