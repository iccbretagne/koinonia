import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Déclaration d'une ligne du registre de la navette",
    description:
      "Multipart : `data` (JSON, nature et champs de la ligne) et `file` (justificatif : photo JPEG, PNG, WebP ou PDF, 10 Mo au plus, type vérifié sur le contenu). Justificatif obligatoire pour une dépense, une caution restituée ou un remboursement du loueur. Solde de départ et abondements réservés à la comptabilité ; un seul solde de départ par église (409). 411 sans Content-Length et 413 au-delà de 11 Mo, avant lecture du corps. Prise en compte immédiate, sans validation ; journalisée ; une déclaration par l'équipe prévient la comptabilité ; le franchissement du seuil de solde bas alerte la comptabilité et les responsables.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette pour les dépenses, restitutions et remboursements du loueur, dans l'église courante",
    body: { contentType: "multipart/form-data", description: "`data` (JSON de la ligne), `file` (justificatif)" },
    status: 201,
    response: "Ligne créée",
  },
});
