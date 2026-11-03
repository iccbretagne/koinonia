import { defineContract } from "@/lib/openapi/contract";
import { rentalInputSchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  GET: {
    summary: "Locations de véhicule de la navette",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, dans l'église courante",
    response: "Locations, de la plus récente à la plus ancienne",
  },
  POST: {
    summary: "Création d'une location de véhicule",
    description: "Regroupe ensuite les dépenses liées (location, carburant, caution). Journalisée.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, dans l'église courante",
    body: rentalInputSchema,
    status: 201,
    response: "Location créée",
  },
});
