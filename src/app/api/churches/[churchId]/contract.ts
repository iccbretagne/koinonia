import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const emailListSchema = z.array(z.string().email("Email invalide")).optional().default([]);

export const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z.string().min(1, "Le slug est requis"),
  secretariatEmails:    emailListSchema,
  accountingEmails:     emailListSchema,
  primaryColor:         z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale invalide").optional(),
  responsibleProfileId: z.string().nullish(),
  supervisorProfileId:  z.string().nullish(),
});

export const contract = defineContract({
  PUT: {
    summary: "Modification des paramètres d'une église",
    description: "Emails du secrétariat et de la comptabilité, couleur, profil pastoral responsable (qui doit appartenir à l'église, 400 sinon). Le nom, l'adresse publique (slug) et le superviseur ne sont modifiables que par un Super Admin (`church:manage`) : un Admin qui les change reçoit 403. Journalisé.",
    access: "church:settings",
    accessNote: "dans l'église visée ; nom, slug et superviseur : `church:manage` (Super Admin)",
    body: updateSchema,
    response: "Église mise à jour, listes d'emails comprises",
  },
  DELETE: {
    summary: "Suppression d'une église",
    description: "Refusée (400) tant que l'église contient des utilisateurs, ministères ou événements. Journalisé.",
    access: "church:manage",
    response: "`{ success: true }`",
  },
});
