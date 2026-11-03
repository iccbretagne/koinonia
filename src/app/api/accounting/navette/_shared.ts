import { ApiError } from "@/lib/api-utils";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { requireShuttleAccess, requireShuttleManager } from "@/modules/shuttle/auth";
import { entryInputSchema, RECEIPT_MAX_BYTES } from "@/modules/shuttle/schemas";

/** Corps multipart : un justificatif de 10 Mo plus les données et l'enveloppe. */
const MAX_BODY_BYTES = 11 * 1024 * 1024;

type Access = Awaited<ReturnType<typeof requireShuttleAccess>>;

export function actorOf({ session, manager }: Access) {
  return { id: session.user.id!, name: session.user.name ?? session.user.email ?? "Un membre", manager };
}

/** Église courante, puis accès au registre de la navette dans cette église. */
export async function currentChurchAccess(managerOnly = false) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
  const access = managerOnly ? await requireShuttleManager(churchId) : await requireShuttleAccess(churchId);
  return { churchId, ...access };
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

/**
 * Accès à une ligne : l'église qui fait foi est celle de la ligne, jamais le contexte affiché.
 * Une ligne inconnue répond 404.
 */
export async function entryAccess(entryId: string, managerOnly = false) {
  const { getEntryChurchId } = await import("@/modules/shuttle");
  const churchId = await getEntryChurchId(entryId);
  if (!churchId) throw new ApiError(404, "Ligne introuvable");
  const access = managerOnly ? await requireShuttleManager(churchId) : await requireShuttleAccess(churchId);
  return { churchId, ...access };
}
