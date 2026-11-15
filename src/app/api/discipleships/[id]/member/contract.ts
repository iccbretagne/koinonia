import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Mise à jour de la fiche d'un disciple",
    description: "Modifie nom, prénom, email et téléphone de la fiche STAR du disciple de la relation.",
    access: "discipleship:manage",
    accessNote: "dans l'église de la relation ; un Faiseur de Disciples ne modifie que ses propres disciples (403)",
    body: updateSchema,
    response: "Fiche mise à jour (identité, coordonnées, département principal)",
  },
});
