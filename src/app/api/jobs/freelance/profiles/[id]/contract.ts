import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { freelanceProfileFields, modalityEnum } from "@/modules/jobs/schemas";

export const patchProfileSchema = z.object({
  ...freelanceProfileFields,
  title: freelanceProfileFields.title.optional(),
  domain: freelanceProfileFields.domain.optional(),
  description: freelanceProfileFields.description.optional(),
  modality: modalityEnum.optional(),
  status: z.enum(["ACTIVE", "UNAVAILABLE", "ARCHIVED"]).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un profil freelance",
    description: "Un profil non actif n'est visible (sinon 404) que de son auteur et des modérateurs.",
    access: "session",
    accessNote: "toute personne connectée ; profil non actif : auteur ou modérateur",
    response: "Profil freelance avec son auteur",
  },
  PATCH: {
    summary: "Modification d'un profil freelance",
    description: "Seul un modérateur peut archiver un profil ou remettre en ligne un profil archivé par la modération (spec 064).",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    body: patchProfileSchema,
    response: "Profil mis à jour, avec son auteur",
  },
  DELETE: {
    summary: "Suppression d'un profil freelance",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    response: "`{ success: true }`",
  },
});
