import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("validate"),
    validatedClosedProperly: z.boolean(),
    validatedCleaned: z.boolean(),
    validatedEquipmentOk: z.boolean(),
    incidentNotes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("report-issue"),
    incidentNotes: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal("close-manually"),
    notes: z.string().max(1000).optional(),
  }),
]);

export const contract = defineContract({
  PATCH: {
    summary: "Contrôle d'une main courante de salle",
    description: "`validate` contrôle une fermeture déclarée ; `report-issue` et `close-manually` traitent une réservation passée jamais déclarée (signalement d'écart, clôture manuelle).",
    access: "rooms:manage",
    accessNote: "Super Admin, `rooms:manage` dans l'église de la réservation, ou membre de l'équipe de contrôle (départements de fonction SECURITE/ENTRETIEN) ; 404 si la réservation est introuvable",
    body: bodySchema,
    response: "Main courante mise à jour",
  },
});
