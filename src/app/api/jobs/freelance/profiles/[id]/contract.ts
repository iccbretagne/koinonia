import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchProfileSchema = z.object({
  title:         z.string().min(1).max(200).optional(),
  domain:        z.string().min(1).max(150).optional(),
  dailyRate:     z.string().max(100).nullable().optional(),
  hourlyRate:    z.string().max(100).nullable().optional(),
  modality:      z.enum(["REMOTE", "ONSITE", "HYBRID"]).optional(),
  location:      z.string().max(150).nullable().optional(),
  availableFrom: z.string().datetime().nullable().optional(),
  description:   z.string().min(1).optional(),
  contactEmail:  z.string().email().max(150).nullable().optional(),
  contactUrl:    z.string().url().max(500).nullable().optional(),
  status:        z.enum(["ACTIVE", "UNAVAILABLE", "ARCHIVED"]).optional(),
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
    accessNote: "auteur ou modérateur (Super Admin, Admin ou Secrétaire d'une église ; `jobs:manage`)",
    body: patchProfileSchema,
    response: "Profil mis à jour, avec son auteur",
  },
  DELETE: {
    summary: "Suppression d'un profil freelance",
    access: "session",
    accessNote: "auteur ou modérateur (Super Admin, Admin ou Secrétaire d'une église ; `jobs:manage`)",
    response: "`{ success: true }`",
  },
});
