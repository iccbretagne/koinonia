import { z } from "zod";

/**
 * Préremplissage du formulaire « Nouvelle demande » par l'adresse (spec 081, lot 2) : un assistant
 * IA prépare une demande sans rien enregistrer, la personne relit puis envoie elle-même. Seuls des
 * champs de texte et de date simples : jamais d'identifiant (département, compte, événement).
 */

export const PREFILL_KINDS = ["annonce", "visuel", "evenement"] as const;
export type PrefillKind = (typeof PREFILL_KINDS)[number];

const EVENT_TYPES = ["CULTE", "PRIERE", "REUNION", "FORMATION", "AUTRE"] as const;

export const requestPrefillSchema = z.object({
  type: z.enum(PREFILL_KINDS),
  titre: z.string().trim().max(200).optional(),
  texte: z.string().trim().max(2000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  heure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  typeEvenement: z.enum(EVENT_TYPES).optional(),
});

export type RequestPrefill = z.infer<typeof requestPrefillSchema>;

/** Paramètres d'adresse → préremplissage ; `undefined` si absent ou invalide (formulaire vide). */
export function parseRequestPrefill(params: Record<string, string | string[] | undefined>): RequestPrefill | undefined {
  const flat = Object.fromEntries(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" && v !== "" ? [[k, v]] : [])));
  if (!flat.type) return undefined;
  const parsed = requestPrefillSchema.safeParse(flat);
  return parsed.success ? parsed.data : undefined;
}

/** Adresse relative du formulaire prérempli. */
export function requestPrefillHref(prefill: RequestPrefill): string {
  const query = new URLSearchParams(
    Object.entries(prefill).flatMap(([k, v]) => (typeof v === "string" && v !== "" ? [[k, v]] : []))
  );
  return `/requests/new?${query.toString()}`;
}
