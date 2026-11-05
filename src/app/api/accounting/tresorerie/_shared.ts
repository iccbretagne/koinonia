import { ApiError } from "@/lib/api-utils";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { requireTreasuryAccess, requireTreasuryReopen } from "@/modules/treasury/auth";
import { entryInputSchema, RECEIPT_MAX_BYTES } from "@/modules/treasury/schemas";

/** Corps multipart : un justificatif de 10 Mo plus les données et l'enveloppe. */
const MAX_BODY_BYTES = 11 * 1024 * 1024;

/** Église courante, puis accès à la trésorerie dans cette église (spec 076). */
export async function currentTreasury() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
  const access = await requireTreasuryAccess(churchId);
  return { churchId, ...access, actor: { id: access.session.user.id! } };
}

/**
 * Accès à un objet identifié : l'église qui fait foi est celle de l'objet, jamais le contexte
 * affiché. Un objet inconnu répond 404.
 */
export async function treasuryOf(churchId: string | null, notFound: string, reopen = false) {
  if (!churchId) throw new ApiError(404, notFound);
  const access = reopen ? await requireTreasuryReopen(churchId) : await requireTreasuryAccess(churchId);
  return { churchId, session: access.session, actor: { id: access.session.user.id! } };
}

/** Débit limité des écritures, par compte. */
export function limitMutation(request: Request, userId: string) {
  requireRateLimit(request, { prefix: `treasury:${userId}`, ...RATE_LIMIT_MUTATION });
}

/** Paramètres de requête d'une URL, validés par un schéma Zod. */
export function queryOf<T>(request: Request, schema: { parse: (v: unknown) => T }): T {
  return schema.parse(Object.fromEntries(new URL(request.url).searchParams));
}

/**
 * Lit une saisie de ligne en multipart (`data` JSON + `file` facultatif), taille bornée **avant**
 * toute lecture du corps.
 */
export async function readEntryForm(request: Request) {
  const length = request.headers.get("content-length");
  if (!length) throw new ApiError(411, "Longueur du corps requise");
  if (Number(length) > MAX_BODY_BYTES) throw new ApiError(413, "Le justificatif dépasse 10 Mo.");
  const form = await request.formData();
  const raw = form.get("data");
  if (typeof raw !== "string") throw new ApiError(400, "Données manquantes");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Données illisibles");
  }
  const input = entryInputSchema.parse(parsed);
  const file = form.get("file");
  if (file !== null && !(file instanceof File)) throw new ApiError(400, "Justificatif invalide");
  if (file && file.size > RECEIPT_MAX_BYTES) throw new ApiError(400, "Le justificatif dépasse 10 Mo.");
  return { input, file: file && file.size > 0 ? file : null };
}
