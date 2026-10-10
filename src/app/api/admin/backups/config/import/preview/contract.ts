import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const configMetaSchema = z.object({
  schemaVersion: z.number(),
  appVersion: z.string(),
  exportedAt: z.string(),
  categories: z.array(z.string()),
  scope: z.union([z.literal("all"), z.array(z.string())]),
  exportedBy: z.string(),
});

export const previewSchema = z.object({
  _meta: configMetaSchema,
  churches: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    secretariatEmails: z.string().nullable().optional(),
    accountingEmails: z.string().nullable().optional(),
    // Champs legacy (sauvegardes prises avant le passage aux emails multiples, spec 033)
    secretariatEmail: z.string().nullable().optional(),
    accountingEmail: z.string().nullable().optional(),
    primaryColor: z.string().optional(),
    ministries: z.array(z.any()).optional(),
    members: z.array(z.any()).optional(),
    userLinks: z.array(z.any()).optional(),
    userRoles: z.array(z.any()).optional(),
  })),
});

export const contract = defineContract({
  POST: {
    summary: "Aperçu d'une restauration de configuration",
    access: "superAdmin",
    body: previewSchema,
    response: "Ce que l'import créerait ou modifierait, sans rien écrire",
  },
});
