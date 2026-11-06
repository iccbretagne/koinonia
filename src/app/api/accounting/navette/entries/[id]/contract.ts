import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const params = z.object({ id: z.string() });

export const contract = defineContract({
  PATCH: {
    summary: "Correction d'une ligne du registre de la navette",
    description:
      "Multipart comme la création (`data` complet, `file` facultatif qui remplace le justificatif). La nature ne change pas. L'auteur corrige sa ligne pendant 48 heures, tant qu'aucun remboursement n'est demandé pour elle ; la comptabilité à tout moment. Journalisée avec les valeurs avant et après ; une correction par l'équipe prévient la comptabilité.",
    access: "shuttle:manage",
    accessNote: "ou auteur de la ligne (équipe navette) sous 48 h, dans l'église de la ligne",
    params,
    body: { contentType: "multipart/form-data", description: "`data` (JSON de la ligne), `file` (justificatif, facultatif)" },
    response: "Ligne corrigée",
  },
  DELETE: {
    summary: "Suppression d'une ligne du registre de la navette",
    description:
      "Suppression logique : la ligne sort des soldes et reste dans l'historique. Mêmes droits que la correction ; prévient la comptabilité si elle est faite par l'équipe.",
    access: "shuttle:manage",
    accessNote: "ou auteur de la ligne (équipe navette) sous 48 h, dans l'église de la ligne",
    params,
    response: "`{ deleted: true }`",
  },
});
