import { z } from "zod";

/**
 * Schémas purs du module forms (spec 079) : définition d'un formulaire et corps des routes.
 * Aucune dépendance runtime (Prisma, NextAuth) : importables par les `contract.ts`.
 */

export const FORM_KINDS = ["REGISTRATION", "PARTICIPATION", "SURVEY"] as const;
export const FORM_ACCESS = ["PUBLIC", "MEMBERS"] as const;
export const QUESTION_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "DROPDOWN",
  "YES_NO",
  "NUMBER",
  "DATE",
  "EMAIL",
  "PHONE",
  "RATING",
  "CONSENT",
  "SESSION_LEVEL",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types à liste de choix. */
export const CHOICE_TYPES: readonly QuestionType[] = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN"];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SHORT_TEXT: "Texte court",
  LONG_TEXT: "Texte long",
  SINGLE_CHOICE: "Choix unique",
  MULTIPLE_CHOICE: "Choix multiple",
  DROPDOWN: "Liste déroulante",
  YES_NO: "Oui / non",
  NUMBER: "Nombre",
  DATE: "Date",
  EMAIL: "Email",
  PHONE: "Téléphone",
  RATING: "Note de 1 à 5",
  CONSENT: "Consentement",
  SESSION_LEVEL: "Session et niveau",
};

export const FORM_KIND_LABELS: Record<(typeof FORM_KINDS)[number], string> = {
  REGISTRATION: "Inscription",
  PARTICIPATION: "Participation",
  SURVEY: "Sondage",
};

export const RETENTION_MONTHS = { default: 12, max: 24 } as const;
export const MAX_QUESTIONS = 60;
export const MAX_CHOICES = 50;

/** Clé d'une question ou d'un choix : son identifiant, ou une clé provisoire tant qu'il est neuf. */
const key = z.string().trim().min(1).max(40);

export const choiceInputSchema = z.object({
  key,
  label: z.string().trim().min(1).max(200),
  capacity: z.number().int().min(1).max(100_000).nullable().optional(),
});

export const questionConfigSchema = z
  .object({
    min: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    max: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  })
  .strict();

export const questionInputSchema = z.object({
  key,
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1).max(300),
  help: z.string().trim().max(500).nullable().optional(),
  required: z.boolean().default(false),
  config: questionConfigSchema.nullable().optional(),
  choices: z.array(choiceInputSchema).max(MAX_CHOICES).optional(),
  /** Affichage conditionnel : une question précédente (sa clé) et la valeur attendue. */
  condition: z
    .object({ questionKey: key, value: z.string().trim().min(1).max(100) })
    .nullable()
    .optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

const optionalDate = z.coerce.date().nullable().optional();

export const formSettingsSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).nullable().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Adresse : lettres minuscules, chiffres et tirets"),
  access: z.enum(FORM_ACCESS),
  anonymous: z.boolean(),
  opensAt: optionalDate,
  closesAt: optionalDate,
  maxResponses: z.number().int().min(1).max(100_000).nullable().optional(),
  waitlistEnabled: z.boolean(),
  offerHoldHours: z.number().int().min(1).max(14 * 24),
  retentionMonths: z.number().int().min(1).max(RETENTION_MONTHS.max),
});

export const formCreateSchema = z.object({
  title: z.string().trim().min(1).max(150),
  kind: z.enum(FORM_KINDS),
  access: z.enum(FORM_ACCESS).default("PUBLIC"),
  anonymous: z.boolean().default(false),
});

export const formUpdateSchema = formSettingsSchema.partial().extend({
  questions: z.array(questionInputSchema).max(MAX_QUESTIONS).optional(),
});
export type FormUpdateInput = z.infer<typeof formUpdateSchema>;

export const formStatusSchema = z.object({ action: z.enum(["publish", "close", "reopen"]) });

export const formDuplicateSchema = z.object({ title: z.string().trim().min(1).max(150).optional() });

export const responseStatusSchema = z.object({ action: z.literal("cancel") });

/** Réponses envoyées : une valeur par identifiant de question. */
export const answersSchema = z.object({
  answers: z.record(z.string().min(1).max(40), z.unknown()),
});

export const publicAnswersSchema = answersSchema.extend({
  turnstileToken: z.string().max(4096).optional(),
});

export const responsesQuerySchema = z.object({
  status: z.enum(["CONFIRMED", "WAITLISTED", "OFFERED", "CANCELLED", "DECLINED", "EXPIRED"]).optional(),
});

// ─── Affichage conditionnel (partagé par le serveur et la page de réponse) ───

export type AnswerValue = string | number | boolean | string[];

/** Une valeur vaut-elle la valeur attendue par une condition ? */
export function matchesCondition(value: unknown, expected: string): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.includes(expected);
  return String(value) === expected;
}

interface Conditional {
  id: string;
  position: number;
  conditionQuestionId: string | null;
  conditionValue: string | null;
}

/**
 * Questions visibles pour ces valeurs : une question conditionnelle n'apparaît que si la question
 * dont elle dépend est elle-même visible et vaut la valeur attendue.
 */
export function visibleQuestionIds(questions: readonly Conditional[], values: Record<string, unknown>): Set<string> {
  const visible = new Set<string>();
  for (const q of [...questions].sort((a, b) => a.position - b.position)) {
    if (!q.conditionQuestionId || (visible.has(q.conditionQuestionId) && matchesCondition(values[q.conditionQuestionId], q.conditionValue ?? ""))) {
      visible.add(q.id);
    }
  }
  return visible;
}
