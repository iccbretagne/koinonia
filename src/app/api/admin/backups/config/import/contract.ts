import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const importSchema = z.object({
  data: z.object({
    _meta: z.object({
      schemaVersion: z.number(),
      appVersion: z.string(),
      exportedAt: z.string(),
      categories: z.array(z.string()),
      scope: z.union([z.literal("all"), z.array(z.string())]),
      exportedBy: z.string(),
    }),
    churches: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      secretariatEmails: z.string().nullable().optional(),
      accountingEmails: z.string().nullable().optional(),
      // Champs legacy (sauvegardes prises avant le passage aux emails multiples, spec 033)
      secretariatEmail: z.string().nullable().optional(),
      accountingEmail: z.string().nullable().optional(),
      primaryColor: z.string().optional().default("#5E17EB"),
      ministries: z.array(z.any()).default([]),
      members: z.array(z.any()).default([]),
      userLinks: z.array(z.any()).default([]),
      userRoles: z.array(z.any()).default([]),
    })),
  }),
  strategy: z.enum(["SKIP", "UPDATE", "REPLACE"]),
  categories: z.array(z.enum(["structure", "members", "links"])).min(1),
});

export const contract = defineContract({
  POST: {
    summary: "Restauration partielle de la configuration",
    description: "Accepte aussi les sauvegardes antérieures aux emails multiples (spec 033). Journalisé.",
    access: "superAdmin",
    body: importSchema,
    response: "Bilan de l'import par type d'objet",
  },
});
