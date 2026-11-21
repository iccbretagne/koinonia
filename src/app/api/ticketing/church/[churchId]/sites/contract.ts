import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const sitesSettingsSchema = z.object({ enabled: z.boolean() }).strict();

export const contract = defineContract({
  GET: {
    summary: "Billetterie : sites d'événement activés dans l'église",
    description: "Interrupteur des sites d'événement de l'église (spec 084), coupé par défaut.",
    access: "church:settings",
    response: "`{ enabled }`",
  },
  PUT: {
    summary: "Billetterie : activer ou couper les sites d'événement de l'église",
    description: "Coupé, aucun site d'événement de l'église n'est servi ; la page d'inscription standard reste disponible. Journalisé.",
    access: "church:settings",
    body: sitesSettingsSchema,
    response: "`{ enabled }`",
  },
});
