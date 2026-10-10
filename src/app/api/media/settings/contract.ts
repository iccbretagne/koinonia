import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const putSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).optional(),
  logoKey: z.string().nullable().optional(),
  faviconKey: z.string().nullable().optional(),
  logoFilename: z.string().nullable().optional(),
  faviconFilename: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Paramètres du module média d'une église",
    description: "Crée les paramètres par défaut s'ils n'existent pas.",
    access: "media:manage",
    accessNote: "dans l'église visée",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "Paramètres média (logo, favicon, rétention)",
  },
  PUT: {
    summary: "Mise à jour des paramètres du module média",
    access: "media:manage",
    accessNote: "dans l'église visée",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    body: putSchema,
    response: "Paramètres média à jour",
  },
});
