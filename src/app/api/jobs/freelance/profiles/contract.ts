import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const modalityEnum = z.enum(["REMOTE", "ONSITE", "HYBRID"]);

export const createProfileSchema = z.object({
  title:         z.string().min(1).max(200),
  domain:        z.string().min(1).max(150),
  dailyRate:     z.string().max(100).optional().nullable(),
  hourlyRate:    z.string().max(100).optional().nullable(),
  modality:      modalityEnum.default("REMOTE"),
  location:      z.string().max(150).optional().nullable(),
  availableFrom: z.string().datetime().optional().nullable(),
  description:   z.string().min(1),
  contactEmail:  z.string().email().max(150).optional().nullable(),
  contactUrl:    z.string().url().max(500).optional().nullable(),
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
