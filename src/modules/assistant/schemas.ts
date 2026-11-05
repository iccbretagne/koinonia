import { z } from "zod";
import type { AssistantPersona } from "@/generated/prisma/enums";

/**
 * Schémas purs de l'assistant (spec 075), partagés par les contrats d'API (ADR-0023), les
 * services et l'interface.
 */

export const QUESTION_MAX = 300;

export const PERSONAS = ["NIA", "KOI"] as const satisfies readonly AssistantPersona[];
export const PERSONA_NAME: Record<AssistantPersona, string> = { NIA: "Nia", KOI: "Koï" };

export const EXPRESSIONS = ["repos", "bonjour", "reflechit", "content", "desole"] as const;
export type AssistantExpression = (typeof EXPRESSIONS)[number];

/** Rôles nommables dans l'audience d'une fiche ajoutée par le Super Admin. */
export const ROLE_KEYS = [
  "SUPER_ADMIN",
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
  "STAR",
  "PASTORAL_CARE_REFERENT",
  "ACCOUNTANT",
] as const;

const screenSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^\/[\w\-/[\]]*$/, "Chemin d'écran invalide")
  .optional();

export const askSchema = z.object({
  question: z.string().trim().min(1, "Posez une question").max(QUESTION_MAX),
  screen: screenSchema,
});
export type AskInput = z.infer<typeof askSchema>;

export const suggestionsQuerySchema = z.object({ screen: screenSchema });

export const feedbackSchema = z.object({
  entryKey: z.string().trim().max(60).optional(),
  question: z.string().trim().min(1).max(QUESTION_MAX),
  helpful: z.boolean(),
  screen: screenSchema,
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const instanceSettingsSchema = z.object({ enabled: z.boolean() });
export const churchSettingSchema = z.object({ disabled: z.boolean() });
export const personaSchema = z.object({ persona: z.enum(PERSONAS) });

/** Lien interne uniquement : jamais d'adresse externe dans une réponse. */
const internalHref = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?!\/)[^\s]*$/, "Le lien doit être une adresse interne (commençant par /)");

/** Fiche ajoutée par le Super Admin, ou correction d'une fiche fournie. */
export const entryInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  questions: z.array(z.string().trim().min(1).max(QUESTION_MAX)).min(1).max(20),
  answer: z.string().trim().min(1).max(4000),
  href: internalHref.nullish(),
  hrefLabel: z.string().trim().max(80).nullish(),
  roles: z.array(z.enum(ROLE_KEYS)).max(ROLE_KEYS.length).default([]),
  module: z.string().trim().max(40).nullish(),
  screens: z.array(z.string().trim().max(120)).max(20).default([]),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

/** Correction d'une fiche fournie : masquer, rétablir ou remplacer son contenu. */
export const entryPatchSchema = z.union([
  z.object({ action: z.literal("override"), entry: entryInputSchema }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("hide") }),
  z.object({ action: z.literal("show") }),
]);
export type EntryPatch = z.infer<typeof entryPatchSchema>;

export const PENDING_STATUSES = ["OPEN", "ANSWERED", "LINKED", "OFF_TOPIC"] as const;
export const pendingQuerySchema = z.object({ status: z.enum(PENDING_STATUSES).default("OPEN") });

export const pendingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), entry: entryInputSchema }),
  z.object({ action: z.literal("link"), entryKey: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal("offtopic") }),
]);
export type PendingAction = z.infer<typeof pendingActionSchema>;

export const statsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Types des réponses, partagés avec l'interface (effacés à l'exécution). */
export type { AskResponse } from "./services/ask";
export type { SuggestionRef } from "./services/engine";
