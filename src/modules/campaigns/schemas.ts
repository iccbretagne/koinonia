import { z } from "zod";

/**
 * Schémas purs du module campaigns (spec 090, ADR-0032) : format d'import d'une campagne
 * (`koinonia.campaign`, version 1) et corps des routes. Aucune dépendance runtime (Prisma,
 * NextAuth) : importables par les `contract.ts` et par la page de saisie.
 */

export const CAMPAIGN_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "VALIDATED",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ITEM_TYPES = [
  "integer",
  "decimal",
  "text",
  "longtext",
  "yesno",
  "single",
  "multiple",
  "date",
  "group",
  "file_request",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Types autorisés dans un groupe répétable (ni groupe ni demande de fichier imbriqués). */
export const SCALAR_ITEM_TYPES = [
  "integer",
  "decimal",
  "text",
  "longtext",
  "yesno",
  "single",
  "multiple",
  "date",
] as const satisfies readonly ItemType[];
export type ScalarItemType = (typeof SCALAR_ITEM_TYPES)[number];

export const QUALIFIERS = ["EXACT", "ESTIMATE", "TO_RESEARCH", "NOT_APPLICABLE", "NSP"] as const;
export type Qualifier = (typeof QUALIFIERS)[number];

/** Qualificatifs proposés quand la définition n'en déclare pas (`EXACT` est toujours permis). */
export const DEFAULT_QUALIFIERS: readonly Qualifier[] = ["ESTIMATE", "TO_RESEARCH"];

export const FILE_REQUEST_STATUSES = ["CROSS_FIGURE", "FILE_SENT", "TO_RESEARCH", "NOT_NEEDED"] as const;
export type FileRequestStatus = (typeof FILE_REQUEST_STATUSES)[number];

export const FILE_ACCEPT = ["xlsx", "csv", "pdf"] as const;
export type FileAccept = (typeof FILE_ACCEPT)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  integer: "Nombre entier",
  decimal: "Nombre décimal",
  text: "Texte court",
  longtext: "Texte long",
  yesno: "Oui / non",
  single: "Choix unique",
  multiple: "Choix multiple",
  date: "Date",
  group: "Groupe répétable",
  file_request: "Demande de fichier",
};

export const QUALIFIER_LABELS: Record<Qualifier, string> = {
  EXACT: "Exacte",
  ESTIMATE: "Estimation",
  TO_RESEARCH: "À rechercher",
  NOT_APPLICABLE: "Sans objet",
  NSP: "NSP",
};

export const FILE_REQUEST_STATUS_LABELS: Record<FileRequestStatus, string> = {
  CROSS_FIGURE: "Chiffre croisé disponible",
  FILE_SENT: "Fichier transmis",
  TO_RESEARCH: "À rechercher",
  NOT_NEEDED: "Non nécessaire",
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  NOT_STARTED: "Non commencé",
  IN_PROGRESS: "En cours",
  SUBMITTED: "Soumis",
  CHANGES_REQUESTED: "Correction demandée",
  VALIDATED: "Validé",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "Ouverte",
  CLOSED: "Clôturée",
};

/** Longueurs par défaut des textes. */
export const TEXT_MAX_LENGTH = { text: 300, longtext: 5000 } as const;
export const GROUP_MAX_ROWS = 50;
export const FILE_REQUEST_MAX_FILES = 10;
export const DECIMALS_MAX = 4;
export const NOTE_MAX_LENGTH = 1000;
export const FILE_RETENTION_DAYS = { default: 30, min: 1, max: 365 } as const;

export const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Date calendaire « AAAA-MM-JJ » réelle (pas de 2026-02-30). */
export function isValidDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const code = z.string().regex(CODE_PATTERN, "Code : une lettre puis lettres, chiffres ou _ (40 max)");
const key = z.string().regex(KEY_PATTERN, "Clé : lettres, chiffres, _ . - (80 max)");
const day = z.string().refine(isValidDay, "Date AAAA-MM-JJ");
/** Échéance : un jour (fin de journée laissée à l'appelant) ou un instant ISO avec fuseau. */
const dueAt = z.union([day, z.iso.datetime({ offset: true })]);
const label = z.string().trim().min(1).max(300);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const bound = z.number().finite();

// ── Items ──────────────────────────────────────────────────────────────────────────────────────

const itemBase = {
  code,
  label,
  help: optionalText(2000),
  examples: optionalText(2000),
  required: z.boolean().optional(),
  /** Code de restitution (code officiel du rapport), défaut = `code`. */
  reportCode: code.optional(),
  /** Code interne, hors rapport officiel (ex. `M0_C`). */
  internal: z.boolean().optional(),
};

const qualifiers = z.array(z.enum(QUALIFIERS)).max(QUALIFIERS.length).optional();

const choiceSchema = z.strictObject({
  key,
  label: z.string().trim().min(1).max(200),
  /** Choix seul possible (ex. « Aucun ») — choix multiple uniquement. */
  exclusive: z.boolean().optional(),
});
export type DefinitionChoice = z.infer<typeof choiceSchema>;

const choices = z.array(choiceSchema).min(1).max(100);

const integerItem = z.strictObject({
  ...itemBase,
  type: z.literal("integer"),
  qualifiers,
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});
const decimalItem = z.strictObject({
  ...itemBase,
  type: z.literal("decimal"),
  qualifiers,
  min: bound.optional(),
  max: bound.optional(),
  decimals: z.number().int().min(0).max(DECIMALS_MAX).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
});
const textItem = z.strictObject({
  ...itemBase,
  type: z.literal("text"),
  qualifiers,
  maxLength: z.number().int().min(1).max(TEXT_MAX_LENGTH.text).optional(),
});
const longtextItem = z.strictObject({
  ...itemBase,
  type: z.literal("longtext"),
  qualifiers,
  maxLength: z.number().int().min(1).max(TEXT_MAX_LENGTH.longtext).optional(),
});
const yesnoItem = z.strictObject({ ...itemBase, type: z.literal("yesno"), qualifiers });
const singleItem = z.strictObject({ ...itemBase, type: z.literal("single"), qualifiers, choices });
const multipleItem = z.strictObject({ ...itemBase, type: z.literal("multiple"), qualifiers, choices });
const dateItem = z.strictObject({ ...itemBase, type: z.literal("date"), qualifiers });

export const scalarItemSchema = z.discriminatedUnion("type", [
  integerItem,
  decimalItem,
  textItem,
  longtextItem,
  yesnoItem,
  singleItem,
  multipleItem,
  dateItem,
]);
export type ScalarItem = z.infer<typeof scalarItemSchema>;

const groupItem = z.strictObject({
  ...itemBase,
  type: z.literal("group"),
  fields: z.array(scalarItemSchema).min(1).max(30),
  minRows: z.number().int().min(0).max(GROUP_MAX_ROWS).optional(),
  maxRows: z.number().int().min(1).max(GROUP_MAX_ROWS).optional(),
  /** Libellé de la réponse « aucune ligne » (défaut côté interface). */
  noneLabel: z.string().trim().min(1).max(200).optional(),
});
export type GroupItem = z.infer<typeof groupItem>;

const fileRequestItem = z.strictObject({
  ...itemBase,
  type: z.literal("file_request"),
  accept: z.array(z.enum(FILE_ACCEPT)).min(1).max(FILE_ACCEPT.length).optional(),
  maxFiles: z.number().int().min(1).max(FILE_REQUEST_MAX_FILES).optional(),
});
export type FileRequestItem = z.infer<typeof fileRequestItem>;

export const definitionItemSchema = z.discriminatedUnion("type", [
  integerItem,
  decimalItem,
  textItem,
  longtextItem,
  yesnoItem,
  singleItem,
  multipleItem,
  dateItem,
  groupItem,
  fileRequestItem,
]);
export type DefinitionItem = z.infer<typeof definitionItemSchema>;

export const sectionSchema = z.strictObject({
  key,
  title: z.string().trim().min(1).max(150),
  intro: optionalText(5000),
  items: z.array(definitionItemSchema).min(1).max(200),
});
export type DefinitionSection = z.infer<typeof sectionSchema>;

// ── Règles ─────────────────────────────────────────────────────────────────────────────────────

/** Opérande : code (chaîne), constante numérique ou booléenne, ou somme d'opérandes. */
export type Operand = string | number | boolean | { sum: Operand[] };

export const COMPARATORS = ["lte", "lt", "gte", "gt", "eq", "neq"] as const;
export type Comparator = (typeof COMPARATORS)[number];

export type ComparisonCheck = { [K in Comparator]: Record<K, [Operand, Operand]> }[Comparator];
export type RuleCheck =
  | ComparisonCheck
  | { chain_gte: string[] }
  | { chain_lte: string[] }
  | { implies: [RuleCheck, RuleCheck] }
  | { all: RuleCheck[] };

export const operandSchema: z.ZodType<Operand> = z.lazy(() =>
  z.union([code, bound, z.boolean(), z.strictObject({ sum: z.array(operandSchema).min(1).max(50) })])
);

const pair = z.tuple([operandSchema, operandSchema]);
const chain = z.array(code).min(2).max(50);

export const ruleCheckSchema: z.ZodType<RuleCheck> = z.lazy(() =>
  z.union([
    z.strictObject({ lte: pair }),
    z.strictObject({ lt: pair }),
    z.strictObject({ gte: pair }),
    z.strictObject({ gt: pair }),
    z.strictObject({ eq: pair }),
    z.strictObject({ neq: pair }),
    z.strictObject({ chain_gte: chain }),
    z.strictObject({ chain_lte: chain }),
    z.strictObject({ implies: z.tuple([ruleCheckSchema, ruleCheckSchema]) }),
    z.strictObject({ all: z.array(ruleCheckSchema).min(1).max(50) }),
  ])
);

export const ruleSchema = z.strictObject({
  key,
  message: z.string().trim().min(1).max(500),
  check: ruleCheckSchema,
});
export type Rule = z.infer<typeof ruleSchema>;

// ── Campagne ───────────────────────────────────────────────────────────────────────────────────

export const assignmentDefinitionSchema = z.strictObject({
  key,
  label: z.string().trim().min(1).max(150),
  dueAt: dueAt.optional(),
  /** Emails des répondants ; seuls les comptes de l'église sont retenus à l'import. */
  respondents: z.array(z.email().max(254)).max(50).optional(),
});
export type DefinitionAssignment = z.infer<typeof assignmentDefinitionSchema>;

export const formDefinitionSchema = z.strictObject({
  key,
  title: z.string().trim().min(1).max(150),
  confidential: z.boolean().optional(),
  intro: optionalText(5000),
  assignments: z.array(assignmentDefinitionSchema).min(1).max(100),
  sections: z.array(sectionSchema).min(1).max(50),
});
export type DefinitionForm = z.infer<typeof formDefinitionSchema>;

export const campaignDefinitionSchema = z.strictObject({
  format: z.literal("koinonia.campaign"),
  version: z.literal(1),
  campaign: z.strictObject({
    key,
    title: z.string().trim().min(1).max(150),
    description: optionalText(5000),
    periodStart: day.optional(),
    periodEnd: day.optional(),
    dueAt: dueAt.optional(),
    fileRetentionDays: z.number().int().min(FILE_RETENTION_DAYS.min).max(FILE_RETENTION_DAYS.max).optional(),
  }),
  forms: z.array(formDefinitionSchema).min(1).max(50),
  rules: z.array(ruleSchema).max(200).optional(),
});
export type CampaignDefinition = z.infer<typeof campaignDefinitionSchema>;

/** Contenu stocké de `CampaignForm.definition`. */
export const storedFormDefinitionSchema = z.object({
  intro: z.string().optional(),
  sections: z.array(sectionSchema),
});
export type StoredFormDefinition = z.infer<typeof storedFormDefinitionSchema>;

// ── Corps des routes ───────────────────────────────────────────────────────────────────────────

/** Import : la définition est validée ensuite par `campaignDefinitionSchema` (erreurs détaillées). */
export const importBodySchema = z.object({
  definition: z.unknown(),
  dryRun: z.boolean().default(true),
  /**
   * Mise à jour d'une campagne existante : son église fait foi (pas l'église courante), et la clé
   * de la définition doit être la sienne.
   */
  campaignId: z.string().min(1).max(64).optional(),
});

export const campaignSettingsSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    periodStart: day.nullable().optional(),
    periodEnd: day.nullable().optional(),
    dueAt: dueAt.nullable().optional(),
    fileRetentionDays: z.number().int().min(FILE_RETENTION_DAYS.min).max(FILE_RETENTION_DAYS.max).optional(),
  })
  .refine((v) => !v.periodStart || !v.periodEnd || v.periodStart <= v.periodEnd, {
    message: "Le début de période doit précéder sa fin",
    path: ["periodEnd"],
  });

export const campaignStatusSchema = z.object({ action: z.enum(["open", "close", "reopen"]) });

export const managerAddSchema = z.object({ userId: z.string().trim().min(1).max(64) });

export const answerInputSchema = z.object({
  code,
  value: z.unknown(),
  qualifier: z.enum(QUALIFIERS).optional(),
  note: z.string().max(NOTE_MAX_LENGTH).nullable().optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const answersBodySchema = z.object({
  answers: z
    .array(answerInputSchema)
    .min(1)
    .max(100)
    .refine((list) => new Set(list.map((a) => a.code)).size === list.length, "Code répété"),
});

export const reviewSchema = z
  .object({
    action: z.enum(["request_changes", "validate"]),
    reason: z.string().trim().max(2000).optional(),
    pastoralValidated: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "request_changes" && !v.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Motif obligatoire" });
    }
  });

export const respondentAddSchema = z.union([
  z.strictObject({ userId: z.string().trim().min(1).max(64) }),
  z.strictObject({ name: z.string().trim().min(1).max(150), email: z.email().max(254) }),
]);

export const exportQuerySchema = z.object({
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
  form: key.optional(),
});

export const candidatesQuerySchema = z.object({ q: z.string().trim().max(100).optional() });
