import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const params = z.object({ id: z.string() });

export const contract = defineContract({
  PATCH: {
    summary: "Correction d'une ligne de trésorerie",
    description:
      "Multipart comme la saisie (`data` complet, `file` facultatif qui remplace le justificatif). Mêmes contrôles ; l'ancienne et la nouvelle date doivent être dans des mois ouverts. Un transfert se corrige par `PATCH /transfers/{groupId}` ; une remise ne se corrige pas (la supprimer et la refaire) ; le montant, le moyen et le compte d'une ligne de chèques suivent ses chèques. Journalisée avec les valeurs avant et après.",
    access: "treasury:manage",
    accessNote: "dans l'église de la ligne",
    params,
    body: { contentType: "multipart/form-data", description: "`data` (JSON de la ligne), `file` (justificatif, facultatif)" },
    response: "Ligne corrigée",
  },
  DELETE: {
    summary: "Suppression d'une ligne de trésorerie",
    description:
      "Suppression logique : la ligne sort des soldes et reste dans l'historique. Un transfert est supprimé avec ses deux jambes ; une remise remet ses chèques en caisse ; une ligne dont des chèques ont été remis est refusée. Refusée dans un mois clôturé.",
    access: "treasury:manage",
    accessNote: "dans l'église de la ligne",
    params,
    response: "`{ deleted: true }`",
  },
});
