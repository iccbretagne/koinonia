import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  targetEventId: z.string().min(1, "L'événement cible est requis"),
});

export const contract = defineContract({
  POST: {
    summary: "Recopie du planning d'un événement vers un autre",
    description: "Copie les statuts de service des départements présents dans les deux événements ; les autres sont ignorés. L'événement cible doit appartenir à la même église (403) et différer de la source (400). Les STAR dont le service change sont prévenus par récapitulatif différé (spec 060).",
    access: "planning:edit",
    accessNote: "dans l'église de l'événement source",
    body: schema,
    response: "`{ copied, departments }` : plannings copiés et départements concernés",
  },
});
