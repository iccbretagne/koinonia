/**
 * Schéma Zod du manifeste d'import — garde-fou avant toute écriture BDD/S3.
 * Les types « source de vérité » vivent dans `types.ts` ; ce schéma les valide à l'exécution.
 */

import { z } from "zod";
import type { Manifest } from "./types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const manifestSequenceSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().min(1),
  filePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  isPredication: z.boolean(),
  fromPredicationsLibrary: z.boolean(),
});

export const manifestCulteSchema = z
  .object({
    folder: z.string().min(1),
    date: isoDate,
    slot: z.union([z.literal(1), z.literal(2), z.null()]),
    serviceDateUtc: z.string().datetime(),
    title: z.string().min(1),
    speaker: z.string().min(1).nullable(),
    type: z.enum(["CULTE", "AUTRE"]),
    sequences: z.array(manifestSequenceSchema).min(1),
  })
  .refine(
    (c) => new Set(c.sequences.map((s) => s.order)).size === c.sequences.length,
    { message: "ordres de séquence non uniques" }
  )
  .refine(
    (c) => new Set(c.sequences.map((s) => s.title.trim().toLowerCase())).size === c.sequences.length,
    { message: "titres de séquence non uniques" }
  );

export const manifestSchema = z.object({
  cultes: z.array(manifestCulteSchema),
  report: z.object({
    unrecognizedFolders: z.array(z.string()),
    excludedFiles: z.array(z.object({ folder: z.string(), name: z.string() })),
    nonCanonicalTitles: z.array(z.object({ folder: z.string(), raw: z.string() })),
    collisions: z.array(z.object({ folder: z.string(), title: z.string() })),
    cultesWithoutPredication: z.array(z.string()),
    substitutions: z.array(z.object({ folder: z.string(), from: z.string() })),
    matchedPredicationUnused: z.array(z.object({ folder: z.string(), predication: z.string() })),
  }),
});

/** Valide le manifeste ; lève une `ZodError` détaillée si une règle est violée. */
export function assertValidManifest(manifest: Manifest): void {
  manifestSchema.parse(manifest);
}
