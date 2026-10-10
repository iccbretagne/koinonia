import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({ segmentId: z.string() });

export const contract = defineContract({
  POST: {
    summary: "Comptage d'une écoute",
    description: "410 si le culte n'est plus publié.",
    access: "audio:listen",
    accessNote: "`audio:listen` dans l'église du culte, ou membre d'une église bénéficiaire d'un partage de bibliothèque (spec 036)",
    body: schema,
    response: "`{ ok: true }`",
  },
});
