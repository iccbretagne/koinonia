import { defineContract } from "@/lib/openapi/contract";
import { responsesQuerySchema } from "@/modules/forms/schemas";

export const contract = defineContract({
  GET: {
    summary: "Réponses d'un formulaire",
    description:
      "Réponses avec leurs valeurs, leur session et leur niveau, leurs présences et, pour un formulaire nominatif, le compte qui a répondu. Un sondage anonyme n'a aucune identité. Un intervenant ne voit que son périmètre (sessions, niveaux), sans adresse email.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire, ou intervenant désigné tant que le formulaire n'est pas clôturé",
    query: responsesQuerySchema,
    response: "Réponses, de la plus ancienne à la plus récente",
  },
});
