import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const money = z.coerce.number().min(0).max(1_000_000);
const reason = z.string().trim().min(1, "Motif obligatoire").max(500);

export const justificationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), spentAmount: money, attachmentIds: z.array(z.string().min(1).max(40)).max(20).default([]) }).strict(),
  z.object({ action: z.literal("accept") }).strict(),
  z.object({ action: z.literal("reject"), reason }).strict(),
  z.object({ action: z.literal("waive"), reason, retainedAmount: money }).strict(),
  z.object({ action: z.literal("return"), returnedAt: z.string().datetime(), treasuryAccountId: z.string().min(1).max(40).nullish() }).strict(),
]);
export type JustificationAction = z.infer<typeof justificationActionSchema>;

export const contract = defineContract({
  GET: {
    summary: "Détail d'une justification",
    description: "Demandes couvertes, factures, montant dépensé, reliquat ou complément, décision. L'église de la justification fait foi (sinon 404).",
    access: "session",
    accessNote: "compta, demandeur, ou périmètre comptable",
    response: "`JustificationView`",
  },
  PATCH: {
    summary: "Geste sur une justification",
    description:
      "`submit` (demandeur seul) : factures cumulées (déposées par `/api/accounting/attachments`) et montant total dépensé (imposé au montant d'une note de frais). `accept`, `reject` (motif), `waive` (motif et montant retenu ≤ versé), `return` (date ; `treasuryAccountId` : compte de trésorerie actif, mois ouvert, sinon compte commun) : compta. Chaque geste est journalisé et prévient le demandeur ; un état incompatible répond 400.",
    access: "session",
    accessNote: "demandeur pour `submit`, accounting:manage pour les autres actions",
    body: justificationActionSchema,
    response: "`JustificationView`",
  },
});
