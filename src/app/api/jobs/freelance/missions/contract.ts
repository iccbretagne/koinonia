import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { freelanceMissionFields, modalityEnum } from "@/modules/jobs/schemas";

export { modalityEnum } from "@/modules/jobs/schemas";

export const createMissionSchema = z.object({
  ...freelanceMissionFields,
  modality: modalityEnum.default("REMOTE"),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des missions freelance actives",
    access: "session",
    accessNote: "toute personne connectée (module emploi transversal aux églises)",
    response: "Missions actives, des plus récentes aux plus anciennes, avec leur auteur",
  },
  POST: {
    summary: "Publication d'une mission freelance",
    description: "Notifie in-app les abonnés aux missions freelance, sans bloquer la réponse.",
    access: "jobs:freelance",
    accessNote: "permission transverse aux églises (`requirePlatformPermission`)",
    body: createMissionSchema,
    response: "Mission créée, avec son auteur",
    status: 201,
  },
});
