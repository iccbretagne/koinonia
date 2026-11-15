import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { seekerFields } from "@/modules/jobs/schemas";

export const createSeekerSchema = z
  .object({
    ...seekerFields,
    wantEmploi: z.boolean().default(false),
    wantStage: z.boolean().default(false),
    wantAlternance: z.boolean().default(false),
    remote: z.boolean().default(false),
  })
  .refine((d) => d.wantEmploi || d.wantStage || d.wantAlternance, {
    message: "Au moins un type de contrat doit être sélectionné",
  });

export const contract = defineContract({
  GET: {
    summary: "Liste des profils de chercheurs d'emploi actifs",
    access: "session",
    accessNote: "toute personne connectée (module emploi transversal aux églises)",
    query: z.object({ type: z.enum(["EMPLOI", "STAGE", "ALTERNANCE"]).optional().describe("Filtre sur le type de contrat recherché") }),
    response: "Profils actifs, des plus récents aux plus anciens, avec leur auteur",
  },
  POST: {
    summary: "Publication d'un profil de chercheur d'emploi",
    description: "Au moins un type de contrat doit être sélectionné. Notifie in-app les abonnés aux profils, sans bloquer la réponse.",
    access: "jobs:seek",
    accessNote: "permission transverse aux églises (`requirePlatformPermission`)",
    body: createSeekerSchema,
    response: "Profil créé, avec son auteur",
    status: 201,
  },
});
