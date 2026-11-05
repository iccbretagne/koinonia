import { defineContract } from "@/lib/openapi/contract";
import { personaSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Personnage de l'assistant choisi par le compte",
    description: "Nia par défaut.",
    access: "session",
    response: "{ persona: \"NIA\" | \"KOI\" }",
  },
  PUT: {
    summary: "Choix du personnage de l'assistant",
    description: "Préférence du compte (« Mon profil »), valable sur tous ses appareils.",
    access: "session",
    body: personaSchema,
    response: "{ persona }",
  },
});
