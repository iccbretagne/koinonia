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
      scheduledDate: z.iso.datetime(),
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
  z.object({
    action: z.literal("claimJustification"),
  }),
  z.object({
    action: z.literal("requestPiece"),
    note:   z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("cancelPieceRequest"),
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
    description: "Cycle SUBMITTED → PROCESSING → APPROVED/REJECTED. Approuver une demande récurrente crée l'occurrence suivante. Le demandeur est notifié à chaque étape. `claimJustification` (spec 078) réclame les justificatifs d'une demande entièrement versée avant la mise en service du suivi : relances comme après une remise, première échéance comptée à partir d'aujourd'hui ; 400 si la demande n'en attend pas ou en a déjà. `requestPiece` (spec 086) demande ou relance une pièce au demandeur (message facultatif, notification, journalisé) ; 400 si la demande est annulée ou rejetée ou si le demandeur n'est plus membre ; `cancelPieceRequest` retire la mention.",
    access: "session",
    accessNote: "`cancel` : le demandeur, demande `SUBMITTED` ; `process`, `approve`, `reject`, `claimJustification`, `requestPiece`, `cancelPieceRequest` : `accounting:manage`",
    body: patchSchema,
    response: "Demande mise à jour",
  },
});
