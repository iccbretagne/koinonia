import { z } from "zod";
import { Role, SystemMessageSeverity } from "@/generated/prisma/enums";

/**
 * Schémas purs des messages système (spec 071), importables par les contrats d'API (ADR-0023)
 * et par l'écran d'administration.
 */

/** Durée maximale d'un message, de son début à sa fin. */
export const MAX_DURATION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SEVERITIES = ["INFO", "IMPORTANT", "URGENT"] as const satisfies readonly SystemMessageSeverity[];

export const SEVERITY_LABEL: Record<SystemMessageSeverity, string> = {
  INFO: "Information",
  IMPORTANT: "Important",
  URGENT: "Urgent",
};

/**
 * Public d'un message : tableaux vides = pas de restriction sur ce critère ; tout vide = toute
 * l'église (ou toute l'instance). ET entre familles, OU à l'intérieur d'une famille.
 */
export const audienceSchema = z.object({
  roles: z.array(z.enum(Role)).max(20).default([]),
  ministryIds: z.array(z.string().min(1)).max(100).default([]),
  departmentIds: z.array(z.string().min(1)).max(300).default([]),
  /** Ministères et départements : seulement leurs responsables, pas leurs membres. */
  headsOnly: z.boolean().default(false),
});
export type Audience = z.infer<typeof audienceSchema>;

export const EMPTY_AUDIENCE: Audience = { roles: [], ministryIds: [], departmentIds: [], headsOnly: false };

/** Lien du message : https uniquement, ou un chemin de Koinonia. */
const linkUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https:\/\/[^\s]+$/.test(v) || /^\/(?!\/)[^\s]*$/.test(v), {
    message: "Lien attendu en https:// ou commençant par /",
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const titleSchema = z.string().trim().min(1, "Titre requis").max(120);
const bodySchema = z.string().trim().min(1, "Texte requis").max(2000);

/** Portée : une église (son `churchId`) ou toute l'instance (Super Admin). */
export const scopeSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("church"), churchId: z.string().min(1) }),
  z.object({ scope: z.literal("instance") }),
]);

function checkPeriod(
  value: { startsAt?: Date | null; endsAt?: Date },
  ctx: z.RefinementCtx,
  now = new Date()
) {
  if (!value.endsAt) return;
  const start = value.startsAt ?? now;
  if (value.endsAt.getTime() <= start.getTime()) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fin doit être après le début." });
  }
  if (value.endsAt.getTime() <= now.getTime()) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fin doit être dans le futur." });
  }
  if (value.endsAt.getTime() - start.getTime() > MAX_DURATION_DAYS * DAY_MS) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: `${MAX_DURATION_DAYS} jours au plus.` });
  }
}

/** Champs communs, sans valeur par défaut : une modification ne touche que ce qui est fourni. */
const messageFields = z.object({
  title: titleSchema,
  body: bodySchema,
  linkUrl: linkUrlSchema.nullish().transform((v) => v || null),
  linkLabel: optionalText(60),
  severity: z.enum(SystemMessageSeverity),
  audience: audienceSchema,
  /** Absent : maintenant. */
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date(),
});

export const createSchema = z
  .intersection(scopeSchema, messageFields.extend({ severity: z.enum(SystemMessageSeverity).default("INFO") }))
  .superRefine((value, ctx) => checkPeriod(value, ctx));
export type CreateMessageInput = z.infer<typeof createSchema>;

/** Modification : un message programmé change librement ; en cours, titre, texte, lien et fin. */
export const updateSchema = messageFields
  .partial()
  .superRefine((value, ctx) => checkPeriod(value, ctx));
export type UpdateMessageInput = z.infer<typeof updateSchema>;

export const audienceCountSchema = z.intersection(scopeSchema, z.object({ audience: audienceSchema }));
export type AudienceCountInput = z.infer<typeof audienceCountSchema>;

export const receiptSchema = z.object({ action: z.enum(["seen", "dismiss"]) });
