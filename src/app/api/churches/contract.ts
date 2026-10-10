import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
  }).optional(),
});

export const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z.string().min(1).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Liste de toutes les églises",
    access: "superAdmin",
    response: "Églises triées par nom, avec le nombre d'utilisateurs, de ministères et d'événements",
  },
  POST: {
    summary: "Création d'une église",
    description: "Le slug est généré à partir du nom s'il est omis. Tous les Super Admins sont automatiquement rattachés à la nouvelle église. Journalisé.",
    access: "superAdmin",
    body: createSchema,
    response: "Église créée",
    status: 201,
  },
  PATCH: {
    summary: "Action groupée sur des églises",
    description: "`delete` supprime les églises avec toutes leurs données (ministères, départements, événements, planning, rôles) ; `update` modifie le nom ou le slug. Journalisé par église.",
    access: "superAdmin",
    body: bulkSchema,
    response: "`{ deleted: n }` ou `{ updated: n }` selon l'action",
  },
});
