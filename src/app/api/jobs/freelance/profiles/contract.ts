import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { freelanceProfileFields, modalityEnum } from "@/modules/jobs/schemas";

export { modalityEnum } from "@/modules/jobs/schemas";

export const createProfileSchema = z.object({
  ...freelanceProfileFields,
  modality: modalityEnum.default("REMOTE"),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des profils freelance actifs",
    access: "session",
    accessNote: "toute personne connectée (module emploi transversal aux églises)",
    response: "Profils actifs, des plus récents aux plus anciens, avec leur auteur",
  },
  POST: {
    summary: "Publication d'un profil freelance",
    description: "Notifie in-app les abonnés aux profils freelance, sans bloquer la réponse.",
    access: "jobs:freelance",
    accessNote: "permission transverse aux églises (`requirePlatformPermission`)",
    body: createProfileSchema,
    response: "Profil créé, avec son auteur",
    status: 201,
  },
});
