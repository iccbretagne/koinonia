import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { EXPORT_TYPES } from "@/modules/ticketing/schemas";

export const exportQuerySchema = z.object({ type: z.enum(EXPORT_TYPES) });

export const contract = defineContract({
  GET: {
    summary: "Export Excel d'un événement",
    description:
      "`participants` et `options` pour l'organisateur ; `payments` et `refunds` pour l'organisateur et le trésorier ; `passages` (registre des entrées et sorties) pour l'organisateur et l'accueil. Journalisé.",
    access: "session",
    accessNote: "selon le type d'export",
    query: exportQuerySchema,
    response: "Classeur Excel",
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
