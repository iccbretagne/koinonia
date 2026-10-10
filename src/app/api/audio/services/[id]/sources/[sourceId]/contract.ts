import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Suppression d'une source déposée",
    access: "audio:upload",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    response: "`{ deleted: sourceId }`",
  },
});
