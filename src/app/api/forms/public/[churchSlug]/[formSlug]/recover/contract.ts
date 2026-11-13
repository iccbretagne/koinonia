import { defineContract } from "@/lib/openapi/contract";
import { recoverSchema } from "@/modules/forms/schemas";

export { recoverSchema };

export const contract = defineContract({
  POST: {
    summary: "Retrouver ma réponse",
    description:
      "Formulaire public nominatif : renvoie par email le lien « Gérer ma réponse » de la réponse active de cette adresse. Réponse toujours identique, que l'adresse soit connue ou non. Turnstile obligatoire, 3 demandes par minute et par IP.",
    access: "public",
    body: recoverSchema,
    response: "`{ ok: true }`",
  },
});
