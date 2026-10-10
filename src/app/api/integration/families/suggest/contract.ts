import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Suggestion de famille pour une adresse",
    description: "Géocode l'adresse puis cherche la famille dont le secteur la couvre. Limité à 20 appels par minute et par IP.",
    access: "public",
    query: z.object({ address: z.string().describe("Adresse postale à géocoder") }),
    response: "`{ familyId, familyName }` ; les deux valent `null` si l'adresse est introuvable ou hors secteur",
  },
});
