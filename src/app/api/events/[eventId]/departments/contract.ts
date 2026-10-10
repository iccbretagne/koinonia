import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  departmentId: z.string().min(1, "Le département est requis"),
  applyToSeries: z.boolean().optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Rattachement d'un département à un événement",
    description: "Avec `applyToSeries`, rattache le département à cet événement et aux suivants de la série. Le département doit appartenir à l'église de l'événement (403 sinon).",
    access: "events:manage",
    accessNote: "dans l'église de l'événement",
    body: schema,
    status: 201,
    response: "Rattachement créé, département inclus ; `{ created }` (nombre d'événements) pour une série",
  },
  DELETE: {
    summary: "Retrait d'un département d'un événement",
    description: "Supprime aussi le planning du département pour l'événement (ou pour la série avec `applyToSeries`) ; les retraits sont consignés pour les notifications de changement.",
    access: "events:manage",
    accessNote: "dans l'église de l'événement",
    body: schema,
    response: "`{ success: true }`",
  },
});
