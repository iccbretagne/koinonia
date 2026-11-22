import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Justificatif d'une ligne du registre de la navette",
    description: "Servi par Koinonia (`nosniff`, cache privé), y compris pour une ligne supprimée (historique). 404 sans justificatif.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, dans l'église de la ligne",
    params: z.object({ id: z.string() }),
    response: "Image ou PDF",
    responseType: "application/octet-stream",
  },
  POST: {
    summary: "Dépôt du justificatif demandé sur une ligne",
    description: "Spec 086. Multipart `file` (photo ou PDF, 10 Mo, type vérifié sur le contenu). Réservé à l'auteur de la ligne, tant qu'un justificatif est demandé ; permis hors du délai de 48 h, seul le justificatif change. Referme la demande et prévient la compta. Journalisé.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette, auteur de la ligne",
    params: z.object({ id: z.string() }),
    response: "Identifiant de la ligne",
  },
});
