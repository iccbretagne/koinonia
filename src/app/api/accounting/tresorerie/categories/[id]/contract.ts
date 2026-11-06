import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { categoryPatchSchema } from "@/modules/treasury/schemas";

const params = z.object({ id: z.string() });

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une catégorie",
    description: "Nom, ordre, `active` (une catégorie désactivée n'est plus proposée aux nouvelles saisies). Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église de la catégorie",
    params,
    body: categoryPatchSchema,
    response: "Catégorie",
  },
  DELETE: {
    summary: "Suppression d'une catégorie",
    description: "409 si la catégorie est utilisée (lignes ou budget) ou nécessaire à Koinonia : elle se désactive alors.",
    access: "treasury:manage",
    accessNote: "dans l'église de la catégorie",
    params,
    response: "`{ deleted: true }`",
  },
});
