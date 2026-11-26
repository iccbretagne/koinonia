import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Dépôt d'un fichier pour une demande de fichier",
    description:
      "Spec 090. Multipart `requestCode` (code d'une demande de fichier du questionnaire) et `file` : XLSX sans macro, CSV ou PDF, 10 Mo, type vérifié sur le contenu (un fichier renommé est refusé), types acceptés et nombre maximal de la demande respectés. Stockage privé ; première pièce sans état choisi ⇒ « fichier transmis ». Journalisé sans nom de fichier. Répondant tant que la saisie est ouverte ; gestionnaire tant que la campagne n'est pas clôturée.",
    access: "session",
    accessNote: "répondant désigné ou gestionnaire de la campagne",
    body: { contentType: "multipart/form-data", description: "`requestCode` et `file`" },
    response: "Métadonnées du fichier déposé",
    status: 201,
  },
});
