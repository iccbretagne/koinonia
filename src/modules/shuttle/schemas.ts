import { z } from "zod";
import type {
  ShuttleEntryKind,
  ShuttleExpenseCategory,
  ShuttlePaymentMethod,
} from "@/generated/prisma/enums";

/**
 * Schémas purs du registre de la navette (spec 073), partagés par les contrats d'API (ADR-0023)
 * et par l'écran. Les montants se saisissent en euros, toujours positifs (sauf le solde de
 * départ) : le signe est déduit de la nature de la ligne par le service.
 */

export const ENTRY_KINDS = [
  "OPENING_BALANCE",
  "FUNDING",
  "DEPOSIT_RETURN",
  "VENDOR_REFUND",
  "EXPENSE",
] as const satisfies readonly ShuttleEntryKind[];

export const EXPENSE_CATEGORIES = [
  "FUEL",
  "MILEAGE",
  "RENTAL",
  "DEPOSIT",
  "TOLL_PARKING",
  "CLEANING",
  "DAMAGE_FINE",
  "INSURANCE",
  "OTHER",
] as const satisfies readonly ShuttleExpenseCategory[];

export const PAYMENT_METHODS = ["TRANSFER", "CASH", "CHURCH_CARD", "CHEQUE"] as const satisfies readonly ShuttlePaymentMethod[];

export const ENTRY_KIND_LABEL: Record<ShuttleEntryKind, string> = {
  OPENING_BALANCE: "Solde de départ",
  FUNDING: "Abondement",
  DEPOSIT_RETURN: "Caution restituée",
  VENDOR_REFUND: "Remboursement du loueur",
  EXPENSE: "Dépense",
};

export const EXPENSE_CATEGORY_LABEL: Record<ShuttleExpenseCategory, string> = {
  FUEL: "Carburant",
  MILEAGE: "Frais kilométriques",
  RENTAL: "Location de véhicule",
  DEPOSIT: "Caution versée",
  TOLL_PARKING: "Péage, parking",
  CLEANING: "Nettoyage, lavage",
  DAMAGE_FINE: "Franchise, sinistre, amende",
  INSURANCE: "Assurance",
  OTHER: "Autre",
};

export const PAYMENT_METHOD_LABEL: Record<ShuttlePaymentMethod, string> = {
  TRANSFER: "Virement",
  CASH: "Espèces",
  CHURCH_CARD: "Carte de l'église",
  CHEQUE: "Chèque",
};

/** Fournisseur proposé par défaut (spec 073). */
export const DEFAULT_VENDOR = "Super U Location";

/** Délai pendant lequel l'auteur d'une ligne peut la corriger ou la supprimer. */
export const AUTHOR_EDIT_WINDOW_HOURS = 48;

/** Poids maximal d'un justificatif. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** Natures qui exigent un justificatif. */
export const RECEIPT_REQUIRED: readonly ShuttleEntryKind[] = ["EXPENSE", "DEPOSIT_RETURN", "VENDOR_REFUND"];
/** Natures réservées au gestionnaire (`shuttle:manage`). */
export const MANAGER_ONLY_KINDS: readonly ShuttleEntryKind[] = ["OPENING_BALANCE", "FUNDING"];

const MAX_AMOUNT = 1_000_000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Date invalide");

const centsPrecision = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

const positiveAmount = z
  .number()
  .positive("Le montant doit être positif")
  .max(MAX_AMOUNT)
  .refine(centsPrecision, "Deux décimales au plus");

const signedAmount = z
  .number()
  .min(-MAX_AMOUNT)
  .max(MAX_AMOUNT)
  .refine(centsPrecision, "Deux décimales au plus");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const optionalId = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v || null);

const base = {
  date: isoDate,
  label: optionalText(200),
};

/** Saisie d'une ligne, selon sa nature. Sert à la création comme à la correction. */
export const entryInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("OPENING_BALANCE"), amount: signedAmount, ...base }),
  z.object({
    kind: z.literal("FUNDING"),
    amount: positiveAmount,
    paymentMethod: z.enum(PAYMENT_METHODS),
    ...base,
  }),
  z.object({
    kind: z.literal("DEPOSIT_RETURN"),
    amount: positiveAmount,
    vendor: optionalText(120),
    rentalId: optionalId,
    returnOfId: optionalId,
    ...base,
  }),
  z.object({
    kind: z.literal("VENDOR_REFUND"),
    amount: positiveAmount,
    vendor: optionalText(120),
    rentalId: optionalId,
    ...base,
  }),
  z
    .object({
      kind: z.literal("EXPENSE"),
      amount: positiveAmount,
      category: z.enum(EXPENSE_CATEGORIES),
      vendor: optionalText(120),
      liters: z.number().positive().max(10_000).nullish().transform((v) => v ?? null),
      kilometers: z.number().int().positive().max(100_000).nullish().transform((v) => v ?? null),
      personalAdvance: z.boolean().default(false),
      rentalId: optionalId,
      ...base,
    })
    .refine((v) => v.category !== "OTHER" || !!v.label, {
      path: ["label"],
      message: "Libellé obligatoire pour une dépense « Autre »",
    }),
]);
export type EntryInput = z.infer<typeof entryInputSchema>;

export const rentalInputSchema = z
  .object({
    vendor: z.string().trim().min(1, "Loueur requis").max(120),
    vehicle: optionalText(120),
    startDate: isoDate,
    endDate: isoDate.nullish().transform((v) => v ?? null),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "La fin doit être après le début",
  });
export type RentalInput = z.infer<typeof rentalInputSchema>;

export const settingsInputSchema = z.object({
  lowBalanceThreshold: z.number().min(0).max(MAX_AMOUNT).refine(centsPrecision).nullable(),
});

export const noteSchema = z.object({ note: z.string().trim().min(1, "Motif requis").max(300) });

export const importInputSchema = z.object({ category: z.enum(EXPENSE_CATEGORIES) });

/** Filtres de lecture du relevé ; `from`/`to` absents = depuis le début / jusqu'à aujourd'hui. */
export const ledgerQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  authorId: z.string().min(1).optional(),
  rentalId: z.string().min(1).optional(),
  flagged: z.enum(["1"]).optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

/** État d'une demande de remboursement liée à une ligne (lien A). */
export const REIMBURSEMENT_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "PARTIALLY_PAID",
  "PAID",
] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number];

export const REIMBURSEMENT_STATUS_LABEL: Record<ReimbursementStatus, string> = {
  REQUESTED: "Remboursement demandé",
  PROCESSING: "Remboursement en cours",
  APPROVED: "Remboursement validé",
  REJECTED: "Remboursement rejeté",
  CANCELLED: "Demande annulée",
  PARTIALLY_PAID: "Remboursé en partie",
  PAID: "Remboursé",
};
