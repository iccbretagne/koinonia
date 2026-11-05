import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Saisie d'une entrée ou d'une sortie de trésorerie",
    description:
      "Multipart : `data` (JSON : compte, sens, catégorie, objet pour une offrande spéciale, moyen, montant positif, date, libellé, tiers ; `confirmDuplicate` pour confirmer un doublon) et `file` facultatif (justificatif : photo JPEG, PNG, WebP ou PDF, 10 Mo au plus, type vérifié sur le contenu). Catégorie active et du même sens ; les remises et les catégories reprises ne se saisissent pas ici. 409 si une ligne a la même date, le même montant, le même compte et la même catégorie, sauf confirmation. 400 si le mois est clôturé, si le compte est archivé ou si la date précède son solde de départ. 411 sans Content-Length, 413 au-delà de 11 Mo. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: { contentType: "multipart/form-data", description: "`data` (JSON de la ligne), `file` (justificatif, facultatif)" },
    status: 201,
    response: "Ligne créée",
  },
});
