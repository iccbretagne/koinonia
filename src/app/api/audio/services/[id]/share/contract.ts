import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({ segmentId: z.string().optional() });

export const contract = defineContract({
  POST: {
    summary: "Lien public de partage d'un culte",
    description: "Culte publié uniquement (410). Peut viser une seule séquence.",
    access: "audio:listen",
    accessNote: "`audio:listen` dans l'église propriétaire : un membre invité par un partage de bibliothèque ne peut pas générer de lien",
    body: schema,
    response: "`{ url }`",
  },
});
