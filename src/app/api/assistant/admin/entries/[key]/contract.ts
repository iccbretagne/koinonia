import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { entryPatchSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  PATCH: {
    summary: "Corriger, rétablir, masquer ou afficher une fiche de l'assistant",
    description:
      "Fiche fournie : `override` remplace son texte (son audience reste celle de Koinonia), `restore` rétablit le texte fourni, `hide`/`show` la masque ou l'affiche. Fiche ajoutée : `override` la remplace. Journalisé.",
    access: "superAdmin",
    params: z.object({ key: z.string() }),
    body: entryPatchSchema,
    response: "{ ok: true }",
  },
  DELETE: {
    summary: "Supprimer une fiche ajoutée",
    description: "Avec ses formulations rattachées. Une fiche fournie se masque, elle ne se supprime pas (400). Journalisé.",
    access: "superAdmin",
    params: z.object({ key: z.string() }),
    response: "{ ok: true }",
  },
});
