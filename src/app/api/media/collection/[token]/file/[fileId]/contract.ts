import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "URL de téléchargement d'un visuel d'une collection",
    description: "Le visuel doit appartenir à un projet de la collection (403 sinon) et être `APPROVED` ou `FINAL_APPROVED` (403 sinon). Configuration de collection manquante : 400.",
    access: "token",
    accessNote: "jeton de partage `COLLECTION`",
    response: "`{ id, filename, downloadUrl }` : URL signée de la dernière version",
  },
});
