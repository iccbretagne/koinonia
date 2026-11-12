import { defineContract } from "@/lib/openapi/contract";
import { formStatusSchema } from "@/modules/forms/schemas";

export { formStatusSchema };

export const contract = defineContract({
  POST: {
    summary: "Publication, clôture ou réouverture d'un formulaire",
    description:
      "publish : brouillon → publié (au moins une question ; un public nominatif exige une question Email obligatoire). close : publié → clôturé, la conservation court. reopen : clôturé → publié si la fin des réponses n'est pas passée et les réponses pas effacées. Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    body: formStatusSchema,
    response: "Formulaire dans son nouvel état",
  },
});
