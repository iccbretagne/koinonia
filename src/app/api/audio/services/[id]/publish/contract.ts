import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Publication d'un culte audio",
    description: "Journalisé.",
    access: "audio:review",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    response: "Culte publié",
  },
});
