import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const meQuery = z.object({ churchId: z.string().min(1) });

export const contract = defineContract({
  GET: {
    summary: "Ma fiche de candidature",
    description:
      "Spec 073 (D8). Fiche de candidature de l'utilisateur dans l'église, en lecture seule, une fois accueilli par au moins un département (via une fiche STAR liée à son compte). Sans information interne : ni motif, ni département qui l'a renvoyé. `null` s'il n'en a pas.",
    access: "session",
    accessNote: "tout utilisateur ayant un rôle dans l'église",
    query: meQuery,
    response: "Fiche et départements d'accueil, ou `null`",
  },
});
