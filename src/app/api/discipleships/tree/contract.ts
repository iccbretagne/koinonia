import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Arbre de lignée du discipolat",
    description: "Parcours récursif de profondeur illimitée. Mode `primary` : lignée d'origine (via le premier FD) ; `current` : structure actuelle (via le FD actuel).",
    access: "discipleship:view",
    accessNote: "un Faiseur de Disciples voit l'arbre ancré sur lui-même (`rootId` ignoré)",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      mode: z.enum(["primary", "current"]).optional().describe("`primary` (défaut) ou `current`"),
      rootId: z.string().optional().describe("Membre racine ; sans valeur, tous les arbres de l'église"),
    }),
    response: "Nœuds `{ id, discipleId, discipleMakerId, firstMakerId, depth, path, disciple, discipleMaker, firstMaker }` ordonnés par profondeur",
  },
});
