import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Dépôt d'un fichier par un lien personnel",
    description: "Spec 090. Multipart `requestCode` (code d'une demande de fichier du questionnaire) et `file` : XLSX sans macro, CSV ou PDF, 10 Mo, type vérifié sur le contenu (un fichier renommé est refusé), types acceptés et nombre maximal de la demande respectés. Stockage privé ; première pièce sans état choisi ⇒ « fichier transmis ». Journalisé sans nom de fichier. Tant que la saisie est ouverte. Débit limité par IP.",
    access: "token",
    body: { contentType: "multipart/form-data", description: "`requestCode` et `file`" },
    response: "Métadonnées du fichier déposé",
    status: 201,
  },
});
