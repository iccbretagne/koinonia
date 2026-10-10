import { z } from "zod";

/**
 * Schémas purs du module (zod seul), importables par les contrats d'API (ADR-0023) sans tirer
 * Prisma ni NextAuth.
 */

/**
 * Consentement au contact du formulaire public. Absent du body ⇒ `NOW` : tout appelant
 * antérieur à la spec 051 garde le comportement d'avant.
 */
export const contactConsentSchema = z.enum(["NOW", "LATER"]).default("NOW");

/** Motifs d'abandon (liste fixe, spec 051 — amendement de recette). */
export const ABANDON_REASON_CODES = [
  "UNKNOWN_NUMBER",
  "UNREACHABLE",
  "NO_LONGER_INTERESTED",
  "OTHER_CHURCH",
  "MOVED",
  "DUPLICATE",
  "OTHER",
] as const;

/** Actions sur un dossier d'accueil (`PATCH /api/integration/requests/[id]`). */
export const familyPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    assignedFamilyId: z.number().int(),
    assignedFamilyName: z.string().min(1),
    assignedBergerId: z.string().min(1),
  }),
  z.object({ action: z.literal("contact") }),
  z.object({ action: z.literal("whatsapp") }),
  z.object({ action: z.literal("integrate") }),
  z.object({
    action: z.literal("abandon"),
    abandonReasonCode: z.enum(ABANDON_REASON_CODES),
    // Commentaire libre, facultatif — le motif qualifié est `abandonReasonCode`.
    abandonReason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("note"),
    notes: z.string().max(10000),
  }),
  z.object({
    action: z.literal("reopen"),
    // resume : retrouve l'état d'avant l'abandon ; restart : repart de zéro (spec 051)
    mode: z.enum(["resume", "restart"]).default("resume"),
  }),
  z.object({
    action: z.literal("wait"),
    waitingKind: z.enum(["RECONTACT", "MISSION"]),
    note: z.string().max(1000).optional(),
  }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("handback"),
    // Renvoi à l'équipe intégration par le berger : la raison est obligatoire.
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("relance"),
    note: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("edit"),
    firstName:    z.string().min(1).max(100).optional(),
    lastName:     z.string().min(1).max(100).optional(),
    phone:        z.string().min(1).max(30).optional(),
    email:        z.string().email().optional().or(z.literal("")).optional(),
    address:      z.string().max(500).optional().or(z.literal("")).optional(),
    ageRange:     z.enum(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"]).optional(),
    churchStatus: z.enum(["VISITOR", "REGULAR", "ENGAGED"]).optional(),
  }),
]);
