import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const instanceSettingsSchema = z.object({ enabled: z.boolean() });

export const contract = defineContract({
  GET: {
    summary: "MCP : réglage d'instance et activité",
    description: "Interrupteur d'instance et, par église, connexions actives et appels des 30 derniers jours — jamais de contenu.",
    access: "superAdmin",
    response: "`{ enabled, usage }`",
  },
  PUT: {
    summary: "MCP : activer ou couper la connexion des assistants IA pour toute l'instance",
    description: "Couper rend aussitôt inutilisables toutes les connexions. Journalisé.",
    access: "superAdmin",
    body: instanceSettingsSchema,
    response: "`{ enabled }`",
  },
});
