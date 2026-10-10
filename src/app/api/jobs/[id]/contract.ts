import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  type:         z.enum(["EMPLOI", "STAGE", "ALTERNANCE"]).optional(),
  company:      z.string().min(1).max(150).optional(),
  location:     z.string().max(150).nullable().optional(),
  description:  z.string().min(1).optional(),
  duration:     z.string().max(100).nullable().optional(),
  deadline:     z.string().datetime().nullable().optional(),
  contactEmail: z.string().email().max(150).nullable().optional(),
  contactUrl:   z.string().url().max(500).nullable().optional(),
  status:       z.enum(["PUBLISHED", "ARCHIVED"]).optional(),
  // Marqueur de requête « Toujours d'actualité » (spec 034), pas une colonne :
  // retiré du payload avant le update Prisma.
  renew:        z.literal(true).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'une offre d'emploi",
    access: "session",
    accessNote: "toute personne connectée (module emploi transversal aux églises)",
    response: "Offre avec son auteur",
  },
  PATCH: {
    summary: "Modification d'une offre d'emploi",
    description: "Toute modification remet à zéro la demande « Toujours d'actualité » (spec 034) ; `renew: true` sert de simple confirmation sans changer l'offre. `status` permet d'archiver ou de republier.",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    body: patchSchema,
    response: "Offre mise à jour, avec son auteur",
  },
  DELETE: {
    summary: "Suppression d'une offre d'emploi",
    access: "session",
    accessNote: "auteur, ou modérateur : `jobs:manage` dans l'une de ses églises (permission transverse)",
    response: "`{ success: true }`",
  },
});
