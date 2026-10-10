import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bodySchema = z.object({
  photoIds: z.array(z.string()).optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Archive ZIP des médias téléchargeables d'un lien",
    description: "Sans `photoIds`, inclut toutes les photos approuvées de l'événement (ou fichiers validés du projet) ; `MEDIA_ALL` inclut tous les statuts. Un objet absent du stockage est ignoré sans interrompre l'archive. Aucun fichier : 404.",
    access: "token",
    accessNote: "jeton de partage `MEDIA` ou `MEDIA_ALL`",
    body: bodySchema,
    response: "Archive ZIP en flux",
    responseType: "application/zip",
  },
});
