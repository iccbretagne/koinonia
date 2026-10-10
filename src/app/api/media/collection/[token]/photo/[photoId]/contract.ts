import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "URL de téléchargement d'une photo d'une collection",
    description: "La photo doit appartenir à un événement de la collection (403 sinon) et être approuvée, sauf si la collection inclut toutes les photos (403 sinon).",
    access: "token",
    accessNote: "jeton de partage `COLLECTION`",
    response: "`{ id, filename, downloadUrl }`",
  },
});
