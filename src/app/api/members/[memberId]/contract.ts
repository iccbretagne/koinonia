import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  departmentId: z.string().min(1, "Le département principal est requis"),
  additionalDepartmentIds: z.array(z.string()).optional(),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
});

export const contract = defineContract({
  PUT: {
    summary: "Modification d'un STAR",
    description:
      "Remplace l'identité, les coordonnées et les départements. Dans un périmètre restreint, le STAR doit partager au moins un département avec l'appelant (403 sinon) et les affiliations hors périmètre sont préservées. " +
      "Retirer un département supprime les affectations de planning et de tâches à venir qui y étaient rattachées. Tous les départements doivent appartenir à la même église. Journalisé.",
    access: "members:manage",
    accessNote: "dans l'église du STAR ; borné aux départements du périmètre de gestion (responsable, ministre)",
    body: updateSchema,
    response: "STAR mis à jour, avec ses départements (principal en premier)",
  },
  DELETE: {
    summary: "Suppression d'un STAR",
    description:
      "Supprime aussi ses affectations de planning et de tâches, ses présences et relations de discipolat et ses liens de compte. " +
      "Dans un périmètre restreint, le STAR doit appartenir exclusivement aux départements de l'appelant (403 sinon : le retirer de son département à la place). Journalisé.",
    access: "members:manage",
    accessNote: "dans l'église du STAR ; borné aux départements du périmètre de gestion",
    response: "`{ success: true }`",
  },
});
