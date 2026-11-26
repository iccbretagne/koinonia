import { defineContract } from "@/lib/openapi/contract";
import { respondentAddSchema } from "@/modules/campaigns/schemas";

export { respondentAddSchema };

export const contract = defineContract({
  GET: {
    summary: "Répondants d'un questionnaire",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    response: "Répondants : compte ou sans compte, nom, email, lien personnel actif, date d'ajout",
  },
  POST: {
    summary: "Ajout d'un répondant à un questionnaire",
    description:
      "Spec 090. `{ userId }` : compte ayant un rôle dans l'église de la campagne (400 sinon), une seule fois (409). `{ name, email }` : personne sans compte (exception), lien personnel dérivé dont seule l'empreinte est stockée. Campagne ouverte : la personne reçoit son lien. Journalisé sans email.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    body: respondentAddSchema,
    response: "Répondant ajouté",
    status: 201,
  },
});
