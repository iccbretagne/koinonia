import { defineContract } from "@/lib/openapi/contract";
import { instanceSettingsSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Activation de l'assistant pour l'instance",
    access: "superAdmin",
    response: "{ enabled }",
  },
  PUT: {
    summary: "Activer ou désactiver l'assistant pour l'instance",
    description: "Désactivé par défaut à la mise en service. Journalisé.",
    access: "superAdmin",
    body: instanceSettingsSchema,
    response: "{ enabled }",
  },
});
