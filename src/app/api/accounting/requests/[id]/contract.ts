import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action:       z.literal("process"),
    priority:     z.enum(["URGENT", "NORMAL"]),
    priorityNote: z.string().max(500).optional(),
  }),
  z.object({
    action:          z.literal("approve"),
    payments: z.array(z.object({
      amount:        z.number().positive(),
      scheduledDate: z.string().datetime(),
      note:          z.string().max(500).optional(),
    })).min(1),
  }),
  z.object({
    action:          z.literal("reject"),
    rejectionReason: z.string().min(1),
  }),
  z.object({
    action: z.literal("cancel"),
  }),
]);

export const contract = defineContract({
  GET: {
    summary: "Détail d'une demande financière",
    access: "accounting:view",
    accessNote: "dans l'église courante ; périmètre du responsable, ou sa propre demande",
    response: "Demande avec historique, pièces et paiements",
  },
  PATCH: {
    summary: "Action sur une demande financière",
    description: "Cycle SUBMITTED → PROCESSING → APPROVED/REJECTED. Approuver une demande récurrente crée l'occurrence suivante. Le demandeur est notifié à chaque étape.",
    access: "session",
    accessNote: "`cancel` : le demandeur, demande `SUBMITTED` ; `process`, `approve`, `reject` : `accounting:manage`",
    body: patchSchema,
    response: "Demande mise à jour",
  },
});
