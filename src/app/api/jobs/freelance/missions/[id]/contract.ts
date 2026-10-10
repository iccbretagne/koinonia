import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchMissionSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  domain:       z.string().min(1).max(150).optional(),
  duration:     z.string().max(100).nullable().optional(),
  dailyRate:    z.string().max(100).nullable().optional(),
  hourlyRate:   z.string().max(100).nullable().optional(),
  modality:     z.enum(["REMOTE", "ONSITE", "HYBRID"]).optional(),
  location:     z.string().max(150).nullable().optional(),
  description:  z.string().min(1).optional(),
  contactEmail: z.string().email().max(150).nullable().optional(),
  contactUrl:   z.string().url().max(500).nullable().optional(),
  status:       z.enum(["ACTIVE", "FILLED", "ARCHIVED"]).optional(),
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
