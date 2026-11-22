import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Dépôt des pièces demandées sur une demande financière",
    description: "Spec 086. Multipart `files` (1 à 10 : JPEG, PNG ou PDF, 5 Mo chacun). Réservé au demandeur, tant qu'une pièce est demandée (demande non annulée ni rejetée), quel que soit l'état de la demande. Referme la demande de pièce et prévient la compta une fois. 400 sans pièce demandée. Journalisé.",
    access: "session",
    accessNote: "le demandeur de la demande, membre de son église",
    params: z.object({ id: z.string() }),
    response: "Nombre de pièces déposées",
  },
});
