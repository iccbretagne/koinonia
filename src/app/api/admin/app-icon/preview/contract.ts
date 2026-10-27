import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Aperçu d'une icône de l'application avant enregistrement",
    description:
      "Mêmes contrôles que le dépôt (spec 069). Renvoie les variantes préparées en data URL et la couleur de fond proposée (bord de l'image, hors coins) si `background` est absent. Rien n'est enregistré.",
    access: "superAdmin",
    body: {
      contentType: "multipart/form-data",
      description: "`icon` (image, facultatif), `background` (#rrggbb, facultatif), `badge` (image, facultatif)",
    },
    response: "`{ background, variants: { <variante>: data URL }, badge: data URL | null }`",
  },
});
