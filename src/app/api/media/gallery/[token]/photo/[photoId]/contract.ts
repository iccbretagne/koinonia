import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "URL de téléchargement d'une photo de la galerie",
    description: "Si la galerie est limitée aux éléments approuvés (`onlyApproved`), seuls ceux-ci sont servis.",
    access: "token",
    accessNote: "jeton de partage `GALLERY`",
    response: "URL signée de l'original",
  },
});
