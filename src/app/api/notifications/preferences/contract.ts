import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const putSchema = z.object({
  emailEnabled: z.boolean().optional(),
  domains: z.record(z.string(), z.boolean()).optional(),
  /** Interrupteur général des notifications natives (spec 068). */
  pushEnabled: z.boolean().optional(),
  /** Notifications natives par domaine (spec 068). */
  pushDomains: z.record(z.string(), z.boolean()).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Préférences de notification de l'utilisateur",
    access: "session",
    accessNote: "préférences de l'appelant ; seuls les domaines visibles pour lui sont listés",
    response: "Vue des préférences : interrupteurs généraux email et appareils, une ligne par domaine visible (email et appareil), disponibilité des notifications natives, clé publique VAPID et nombre d'appareils",
  },
  PUT: {
    summary: "Mise à jour des préférences de notification",
    description: "Un domaine inconnu ou non accessible à l'utilisateur est refusé (400), pour l'email comme pour les appareils. Voir ADR-0016 (spec 053) et ADR-0024 (spec 068).",
    access: "session",
    accessNote: "préférences de l'appelant",
    body: putSchema,
    response: "Vue des préférences à jour",
  },
});
