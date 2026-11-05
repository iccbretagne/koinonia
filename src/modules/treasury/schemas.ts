import { z } from "zod";
import type {
  TreasuryAccountKind,
  TreasuryCategorySystem,
  TreasuryDirection,
  TreasuryMethod,
} from "@/generated/prisma/enums";

/**
 * Schémas purs de la trésorerie (spec 076), partagés par les contrats d'API (ADR-0023) et par
 * l'écran. Les montants se saisissent en euros, toujours positifs : le sens porte l'entrée ou la
 * sortie.
 */

export const ACCOUNT_KINDS = ["CASH", "ONLINE", "OTHER"] as const satisfies readonly TreasuryAccountKind[];
export const DIRECTIONS = ["IN", "OUT"] as const satisfies readonly TreasuryDirection[];
export const METHODS = ["CASH", "CHEQUE", "TRANSFER", "CARD", "ONLINE", "WERO", "OTHER"] as const satisfies readonly TreasuryMethod[];

export const ACCOUNT_KIND_LABEL: Record<TreasuryAccountKind, string> = {
  CASH: "Caisse",
  ONLINE: "En ligne",
  OTHER: "Autre",
};

export const DIRECTION_LABEL: Record<TreasuryDirection, string> = { IN: "Entrée", OUT: "Sortie" };

export const METHOD_LABEL: Record<TreasuryMethod, string> = {
  CASH: "Espèces",
  CHEQUE: "Chèque",
  TRANSFER: "Virement",
  CARD: "Carte",
  ONLINE: "En ligne",
  WERO: "Wero",
  OTHER: "Autre",
};

/** Catégories par défaut, dans l'ordre de la spec. `system` fixe le rôle de la catégorie. */
export const DEFAULT_CATEGORIES: readonly {
  direction: TreasuryDirection;
  name: string;
  system?: TreasuryCategorySystem;
}[] = [
  { direction: "IN", name: "Dîmes" },
  { direction: "IN", name: "Offrandes" },
  { direction: "IN", name: "Offrandes spéciales", system: "SPECIAL_OFFERING" },
  { direction: "IN", name: "Dons affectés" },
  { direction: "IN", name: "Recettes d'événements" },
  { direction: "IN", name: "Remboursements reçus" },
  { direction: "IN", name: "Autres recettes" },
  { direction: "OUT", name: "Remises au compte commun", system: "DEPOSIT" },
  { direction: "OUT", name: "Loyer et charges" },
  { direction: "OUT", name: "Énergie et fluides" },
  { direction: "OUT", name: "Matériel et équipement" },
  { direction: "OUT", name: "Missions et soutien" },
  { direction: "OUT", name: "Action sociale" },
  { direction: "OUT", name: "Reversements" },
  { direction: "OUT", name: "Notes de frais et avances", system: "EXPENSE_REPORTS" },
  { direction: "OUT", name: "Navette", system: "SHUTTLE" },
  { direction: "OUT", name: "Autres dépenses" },
];

/** Objets proposés par défaut pour les offrandes spéciales. */
export const DEFAULT_PURPOSES = ["Missions", "Construction", "Actions de grâce", "Prémices", "Soutien"] as const;

/** Catégories système qui ne se choisissent pas à la main (elles naissent d'une remise ou d'une reprise). */
export const AUTOMATIC_SYSTEMS: readonly TreasuryCategorySystem[] = ["DEPOSIT", "EXPENSE_REPORTS", "SHUTTLE"];

/** Poids maximal d'un justificatif. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Seuil « À surveiller » du budget (part du budget annuel consommée). */
export const BUDGET_WARNING_RATIO = 0.9;

const MAX_AMOUNT = 10_000_000;

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Date invalide");

export const isoMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois attendu au format AAAA-MM");

const centsPrecision = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

export const positiveAmount = z
  .number()
  .positive("Le montant doit être positif")
  .max(MAX_AMOUNT)
  .refine(centsPrecision, "Deux décimales au plus");

const nonNegativeAmount = z.number().min(0).max(MAX_AMOUNT).refine(centsPrecision, "Deux décimales au plus");

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

const name = z.string().trim().min(1, "Nom requis").max(80);

export const accountInputSchema = z.object({
  name,
  kind: z.enum(ACCOUNT_KINDS),
  openingBalance: signedAmount,
  openingDate: isoDate,
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

export const accountPatchSchema = accountInputSchema.partial().extend({ archived: z.boolean().optional() });
export type AccountPatch = z.infer<typeof accountPatchSchema>;

export const categoryInputSchema = z.object({
  direction: z.enum(DIRECTIONS),
  name,
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export const categoryPatchSchema = z.object({
  name: name.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const purposeInputSchema = z.object({ name });
export const purposePatchSchema = z.object({ name: name.optional(), active: z.boolean().optional() });

/** Saisie d'une ligne ordinaire (création comme correction). */
export const entryInputSchema = z.object({
  accountId: z.string().min(1),
  direction: z.enum(DIRECTIONS),
  categoryId: z.string().min(1),
  purposeId: optionalId,
  method: z.enum(METHODS),
  amount: positiveAmount,
  date: isoDate,
  label: z.string().trim().min(1, "Libellé requis").max(200),
  thirdParty: optionalText(120),
  confirmDuplicate: z.boolean().optional(),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

/** Correction d'une jambe de transfert : seuls la date, le montant et le libellé changent. */
export const transferInputSchema = z
  .object({
    fromId: z.string().min(1),
    toId: z.string().min(1),
    date: isoDate,
    amount: positiveAmount,
    label: optionalText(200),
  })
  .refine((v) => v.fromId !== v.toId, { path: ["toId"], message: "Choisissez deux comptes différents" });
export type TransferInput = z.infer<typeof transferInputSchema>;

const chequeSchema = z.object({
  number: optionalText(30),
  amount: positiveAmount,
  count: z.number().int().min(1).max(500).default(1),
});

export const collectionInputSchema = z
  .object({
    accountId: z.string().min(1),
    eventId: optionalId,
    date: isoDate,
    counter1: z.string().trim().min(1, "Première personne qui a compté requise").max(80),
    counter2: z.string().trim().min(1, "Deuxième personne qui a compté requise").max(80),
    lines: z
      .array(
        z.object({
          categoryId: z.string().min(1),
          purposeId: optionalId,
          cash: nonNegativeAmount.default(0),
          cheques: z.array(chequeSchema).max(500).default([]),
        })
      )
      .min(1, "Saisissez au moins une catégorie")
      .max(50),
  })
  .refine((v) => v.counter1.toLowerCase() !== v.counter2.toLowerCase(), {
    path: ["counter2"],
    message: "Deux personnes différentes doivent compter",
  })
  .refine((v) => v.lines.some((l) => l.cash > 0 || l.cheques.length > 0), {
    path: ["lines"],
    message: "La collecte est vide",
  });
export type CollectionInput = z.infer<typeof collectionInputSchema>;

export const depositInputSchema = z
  .object({
    accountId: z.string().min(1),
    date: isoDate,
    ref: z.string().trim().min(1, "Référence du bordereau requise").max(60),
    cashAmount: nonNegativeAmount.default(0),
    chequeIds: z.array(z.string().min(1)).max(1000).default([]),
  })
  .refine((v) => v.cashAmount > 0 || v.chequeIds.length > 0, {
    path: ["cashAmount"],
    message: "La remise est vide",
  });
export type DepositInput = z.infer<typeof depositInputSchema>;

export const closeMonthSchema = z.object({ month: isoMonth });
export const reopenSchema = z.object({ reason: z.string().trim().min(5, "Motif requis (5 caractères au moins)").max(300) });

export const budgetInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  rows: z
    .array(
      z
        .object({
          categoryId: z.string().min(1),
          annual: nonNegativeAmount.optional(),
          monthly: z.array(nonNegativeAmount).length(12).optional(),
        })
        .refine((r) => r.annual !== undefined || r.monthly !== undefined, "Montant annuel ou mensuel requis")
    )
    .max(200),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const budgetCopySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  from: z.enum(["budget", "actual"]),
});

/** Filtres de lecture du registre ; `from`/`to` absents = depuis le début / jusqu'à aujourd'hui. */
export const ledgerQuerySchema = z.object({
  accountId: z.string().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryId: z.string().min(1).optional(),
  method: z.enum(METHODS).optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const periodQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });
export const monthQuerySchema = z.object({ month: isoMonth.optional() });
export const yearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
export const chequesQuerySchema = z.object({ accountId: z.string().min(1).optional() });
