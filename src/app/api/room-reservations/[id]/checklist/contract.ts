import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bodySchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("open"),
    keyReceivedFromId: z.string().min(1).optional(),
    keyReceivedFromName: z.string().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    phase: z.literal("close"),
    closedProperly: z.boolean(),
    cleaned: z.boolean(),
    equipmentOk: z.boolean(),
    equipmentNotes: z.string().max(500).optional(),
    keyReturnedToId: z.string().min(1).optional(),
    keyReturnedToName: z.string().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
  }),
]);

export const contract = defineContract({
  PATCH: {
    summary: "Déclaration d'ouverture ou de fermeture d'une salle (main courante)",
    description: "`phase: open` déclare l'ouverture (remise des clés, notes) ; `phase: close` déclare la fermeture (salle fermée, nettoyée, matériel en état, clés rendues).",
    access: "session",
    accessNote: "créateur de la réservation uniquement (contrôle d'appartenance dans le module salles)",
    body: bodySchema,
    response: "Main courante mise à jour",
  },
});
