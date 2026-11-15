import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { freelanceMissionFields, modalityEnum } from "@/modules/jobs/schemas";

export const patchMissionSchema = z.object({
  ...freelanceMissionFields,
  title: freelanceMissionFields.title.optional(),
  domain: freelanceMissionFields.domain.optional(),
  description: freelanceMissionFields.description.optional(),
  modality: modalityEnum.optional(),
  status: z.enum(["ACTIVE", "FILLED", "ARCHIVED"]).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'une mission freelance",
    description: "Une mission non active n'est visible (sinon 404) que de son auteur et des modérateurs.",
    access: "session",
    accessNote: "toute personne connectée ; mission non active : auteur ou modérateur",
    response: "Mission avec son auteur",
  },
  PATCH: {
    summary: "Modification d'une mission freelance",
    description: "Seul un modérateur peut archiver une mission ou remettre en ligne une mission archivée par la modération (spec 064) ; l'auteur peut la passer à pourvue.",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    body: patchMissionSchema,
    response: "Mission mise à jour, avec son auteur",
  },
  DELETE: {
    summary: "Suppression d'une mission freelance",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    response: "`{ success: true }`",
  },
});
