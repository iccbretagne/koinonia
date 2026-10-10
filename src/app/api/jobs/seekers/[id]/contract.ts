import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSeekerSchema = z
  .object({
    title:          z.string().min(1).max(200).optional(),
    wantEmploi:     z.boolean().optional(),
    wantStage:      z.boolean().optional(),
    wantAlternance: z.boolean().optional(),
    sector:         z.string().max(150).nullable().optional(),
    location:       z.string().max(150).nullable().optional(),
    remote:         z.boolean().optional(),
    availableFrom:  z.string().datetime().nullable().optional(),
    description:    z.string().min(1).optional(),
    contactEmail:   z.string().email().max(150).nullable().optional(),
    contactUrl:     z.string().url().max(500).nullable().optional(),
    status:         z.enum(["ACTIVE", "FOUND", "ARCHIVED"]).optional(),
  });

export const contract = defineContract({
  GET: {
    summary: "Détail d'un profil de chercheur d'emploi",
    description: "Un profil non actif n'est visible (sinon 404) que de son auteur et des modérateurs.",
    access: "session",
    accessNote: "toute personne connectée ; profil non actif : auteur ou modérateur",
    response: "Profil avec son auteur",
  },
  PATCH: {
    summary: "Modification d'un profil de chercheur d'emploi",
    description: "Seul un modérateur peut archiver un profil ou remettre en ligne un profil archivé par la modération (spec 064) ; passer à `FOUND` est réservé à l'auteur ou à un modérateur.",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    body: patchSeekerSchema,
    response: "Profil mis à jour, avec son auteur",
  },
  DELETE: {
    summary: "Suppression d'un profil de chercheur d'emploi",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    response: "`{ success: true }`",
  },
});
