import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { importInputSchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  POST: {
    summary: "Ajout au registre d'une note de frais de la Navette faite hors registre",
    description:
      "Crée une dépense « avance personnelle » au montant de la note de frais, avec une copie de sa première pièce jointe, liée à la demande (spec 073, lien C). 404 si la note de frais n'est pas du département Navette de l'église courante ; 409 si elle est déjà dans le registre. Journalisé.",
    access: "shuttle:manage",
    accessNote: "dans l'église courante",
    params: z.object({ requestId: z.string() }),
    body: importInputSchema,
    status: 201,
    response: "Ligne créée",
  },
});
