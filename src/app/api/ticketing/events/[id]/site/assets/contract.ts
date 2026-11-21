import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Images du site",
    description: "Images confirmées du site : identifiant, nom, texte alternatif, dimensions, poids, variantes générées et emplacements du brouillon et de la version publiée qui les utilisent.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    response: "Liste d'images avec `usedIn.draft` et `usedIn.published`",
  },
  POST: {
    summary: "Dépôt d'une image du site",
    description:
      "Formulaire multipart : `file` (JPEG, PNG, WebP ou SVG, 8 Mo au plus, type vérifié sur le contenu), `alt` (texte alternatif, 1 à 200 caractères, obligatoire) et `name` (facultatif, 120 caractères, le nom du fichier par défaut). 16 px au moins et 8000 px, 40 millions de pixels au plus. L'image est redressée, un SVG est rastérisé (aucun SVG n'est stocké ni servi), puis converties en variantes WebP de 640, 1280 et 2400 px de large (sans agrandissement) dépouillées de toute métadonnée. Journalisé.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    body: { contentType: "multipart/form-data", description: "Champs `file`, `alt`, `name`" },
    response: "`{ id, width, height }`",
  },
});
