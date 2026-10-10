import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const confirmSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
});

export const contract = defineContract({
  GET: {
    summary: "Feuille d'annonces d'un événement",
    access: "planning:view",
    accessNote: "et droit de lecture : déposants, Ministres, responsables de département et membres d'un département Modération (403 sinon)",
    response: "`{ sheet, downloadUrl }` avec une adresse de téléchargement signée ; `{ sheet: null }` si aucune feuille",
  },
  POST: {
    summary: "Confirmation du dépôt d'une feuille d'annonces",
    description: "À appeler après le téléversement via l'adresse signée de `/sign`. Remplace une feuille existante (l'ancien fichier est supprimé) ; 404 si le fichier n'est pas arrivé. Les lecteurs sont notifiés.",
    access: "planning:view",
    accessNote: "et droit de dépôt : Super Admin, Admin, Secrétaire, ou membre d'un département Secrétariat (403 sinon)",
    body: confirmSchema,
    status: 201,
    response: "`{ sheet }` : feuille enregistrée",
  },
  DELETE: {
    summary: "Retrait de la feuille d'annonces",
    description: "Supprime aussi le fichier stocké ; 404 si aucune feuille n'est déposée.",
    access: "planning:view",
    accessNote: "et droit de dépôt : Super Admin, Admin, Secrétaire, ou membre d'un département Secrétariat (403 sinon)",
    response: "`{ success: true }`",
  },
});
