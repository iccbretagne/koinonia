import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    primaryDepartmentId: z.string().min(1).optional(),
  }).optional(),
});

export const createSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").optional(),
  departmentId: z.string().min(1, "Le département principal est requis"),
  additionalDepartmentIds: z.array(z.string()).optional(),
  confirmDuplicate: z.boolean().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des STAR d'une église",
    access: "members:view",
    accessNote: "limité aux départements du périmètre de gestion (responsable, ministre)",
    query: z.object({
      churchId: z.string(),
      departmentId: z.string().optional().describe("Restreint à un département ; 403 hors périmètre"),
    }),
    response: "STAR triés par nom, avec leurs départements (principal en premier)",
  },
  PATCH: {
    summary: "Suppression ou modification groupée de STAR",
    description:
      "Tous les STAR doivent appartenir à la même église. Dans un périmètre restreint, supprimer exige " +
      "des STAR entièrement dans le périmètre ; modifier exige au moins un département partagé, et le " +
      "département principal visé doit être dans le périmètre. Chaque STAR est journalisé.",
    access: "members:manage",
    body: bulkSchema,
    response: "`{ deleted }` ou `{ updated }` : nombre de STAR traités",
  },
  POST: {
    summary: "Création d'un STAR",
    description:
      "Les départements supplémentaires doivent appartenir à l'église du département principal. Sans " +
      "`confirmDuplicate`, des doublons probables (email, nom) renvoient `409 { duplicates }` sans créer.",
    access: "members:manage",
    accessNote: "département principal dans le périmètre de gestion",
    body: createSchema,
    status: 201,
    response: "STAR créé, départements inclus",
  },
});
