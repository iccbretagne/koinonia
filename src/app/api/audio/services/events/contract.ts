import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const querySchema = z.object({ date: z.string().min(1) });

export const contract = defineContract({
  GET: {
    summary: "Événements rattachables à un culte audio",
    access: "audio:upload",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    query: z.object({
      date: z.string().describe("Jour recherché (AAAA-MM-JJ)"),
    }),
    response: "Événements du planning à cette date",
  },
});
