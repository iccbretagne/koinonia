import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const churchSettingsSchema = z.object({ enabled: z.boolean() });

export const contract = defineContract({
  GET: {
    summary: "MCP : réglage et assistants connectés d'une église",
    description: "Interrupteur de l'église (coupé par défaut), état de l'interrupteur d'instance, et liste des comptes connectés, sans contenu.",
    access: "church:settings",
    response: "`{ enabled, instanceEnabled, connections }`",
  },
  PUT: {
    summary: "MCP : activer ou couper la connexion des assistants IA dans l'église",
    description: "Couper rend aussitôt inutilisables les connexions de l'église ; réactiver ne restaure pas les connexions révoquées. Journalisé.",
    access: "church:settings",
    body: churchSettingsSchema,
    response: "`{ enabled }`",
  },
});
