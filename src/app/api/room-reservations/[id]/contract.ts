import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  action: z.literal("cancel"),
  scope: z.enum(["occurrence", "series"]),
});

export const contract = defineContract({
  PATCH: {
    summary: "Annulation d'une réservation de salle",
    description: "Annule l'occurrence seule ou toute la série (`scope`). Journalisé.",
    access: "session",
    accessNote: "créateur de la réservation, ou `rooms:manage` dans son église (Super Admin compris) ; 403 sinon",
    body: patchSchema,
    response: "Résultat de l'annulation, dont les identifiants annulés (`cancelledIds`)",
  },
});
