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

export const PARTICIPATION_ROLES = ["attendance", "companions"] as const;
export type ParticipationRole = (typeof PARTICIPATION_ROLES)[number];

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
    /**
     * Participation (lot 3) : « Je viens » (oui/non) et « Nombre d'accompagnants » (nombre), pour
     * compter les participants accompagnants compris.
     */
    participation: z.enum(PARTICIPATION_ROLES).optional(),
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

/** Session d'une inscription (lot 2) : un ou deux jours, niveaux avec places. */
export const levelInputSchema = z.object({
  key,
  code: z.string().trim().min(1).max(20),
  label: z.string().trim().max(150).nullable().optional(),
  capacity: z.number().int().min(1).max(10_000),
  /** Niveau d'entrée : pas de prérequis, « niveau précédent suivi » n'est pas demandé. */
  isEntry: z.boolean().default(false),
});

export const sessionInputSchema = z.object({
  key,
  label: z.string().trim().min(1).max(150),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ"),
  days: z.union([z.literal(1), z.literal(2)]),
  levels: z.array(levelInputSchema).min(1).max(20),
});
export type SessionInput = z.infer<typeof sessionInputSchema>;

export const formUpdateSchema = formSettingsSchema.partial().extend({
  questions: z.array(questionInputSchema).max(MAX_QUESTIONS).optional(),
  sessions: z.array(sessionInputSchema).max(20).optional(),
  /** Rattachement d'une participation (lot 3) : un événement d'église ou de billetterie, ou aucun. */
  eventId: z.string().min(1).max(40).nullable().optional(),
  ticketingEventId: z.string().min(1).max(40).nullable().optional(),
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

/** « Retrouver ma réponse » (formulaire public). */
export const recoverSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  turnstileToken: z.string().max(4096).optional(),
});

/** Place proposée en liste d'attente : accepter ou décliner. */
export const offerSchema = z.object({ accept: z.boolean() });

/** Intervenants d'un formulaire (liste complète). */
export const facilitatorsSchema = z.object({
  facilitators: z
    .array(
      z.object({
        userId: z.string().min(1).max(40),
        allScope: z.boolean(),
        scopes: z.array(z.object({ sessionId: z.string().min(1).max(40), levelId: z.string().min(1).max(40).nullable().optional() })).max(60).default([]),
      })
    )
    .max(50),
});

/** Feuille de présence : cases à enregistrer (la dernière saisie l'emporte). */
export const attendanceSchema = z.object({
  sessionId: z.string().min(1).max(40),
  cells: z
    .array(z.object({ responseId: z.string().min(1).max(40), day: z.union([z.literal(1), z.literal(2)]), half: z.enum(["AM", "PM"]), present: z.boolean() }))
    .min(1)
    .max(400),
});

export const attendanceQuerySchema = z.object({ sessionId: z.string().min(1).max(40) });

export const responsesQuerySchema = z.object({
  status: z.enum(["CONFIRMED", "WAITLISTED", "OFFERED", "CANCELLED", "DECLINED", "EXPIRED"]).optional(),
  sessionId: z.string().min(1).max(40).optional(),
  levelId: z.string().min(1).max(40).optional(),
});

// ─── Affichage conditionnel (partagé par le serveur et la page de réponse) ───

/** Réponse à « session et niveau » (lot 2). */
export interface RegistrationValue {
  sessionId: string;
  levelId: string;
  /** Indicatif, null pour un niveau d'entrée. */
  previousLevelDone: boolean | null;
}

export type AnswerValue = string | number | boolean | string[] | RegistrationValue;

/** Une valeur vaut-elle la valeur attendue par une condition ? */
export function matchesCondition(value: unknown, expected: string): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.includes(expected);
  if (typeof value === "object") return false;
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
