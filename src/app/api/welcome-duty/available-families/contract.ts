import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Familles disponibles dans l'annuaire externe",
    description: "Interroge le service externe des familles (mis en cache une heure) ; 502 s'il est injoignable.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    response: "`{ families }` : liste de `{ id, name }` triée par nom",
  },
});
