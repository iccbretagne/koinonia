import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { rentalInputSchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une location de véhicule",
    description: "Journalisée avec les valeurs avant et après.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, dans l'église de la location",
    params: z.object({ id: z.string() }),
    body: rentalInputSchema,
    response: "Location",
  },
});
