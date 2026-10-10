import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const subSchema = z.object({
  inApp:                 z.boolean().optional(),
  email:                 z.boolean().optional(),
  wantEmploi:            z.boolean().optional(),
  wantStage:             z.boolean().optional(),
  wantAlternance:        z.boolean().optional(),
  wantSeekers:           z.boolean().optional(),
  wantFreelanceMissions: z.boolean().optional(),
  wantFreelanceProfiles: z.boolean().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Abonnement de l'utilisateur aux alertes emploi",
    description: "Crée l'abonnement par défaut s'il n'existe pas encore.",
    access: "session",
    accessNote: "abonnement de l'appelant",
    response: "Abonnement (canaux in-app/email et types d'annonces suivis)",
  },
  PUT: {
    summary: "Mise à jour de l'abonnement aux alertes emploi",
    description: "Mise à jour partielle : seuls les champs fournis changent. L'envoi d'email dépend aussi de la préférence du domaine « jobs » (spec 053).",
    access: "session",
    accessNote: "abonnement de l'appelant",
    body: subSchema,
    response: "Abonnement mis à jour",
  },
});
