import { ApiError } from "@/lib/api-utils";
import { getClientIp, requireRateLimit, RATE_LIMIT_MUTATION, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import type { AssignmentAccess } from "@/modules/campaigns/auth";

/**
 * Outils communs aux routes du niveau questionnaire (spec 090), avec compte ou par lien. Les
 * routes par lien limitent le débit par IP **avant** de résoudre le jeton.
 */

/** Sauvegarde automatique : envois fréquents, limite large. */
const RATE_LIMIT_AUTOSAVE = { windowMs: 60_000, max: 120 };

const who = (access: AssignmentAccess) =>
  access.actor.kind === "user" ? access.actor.userId : `r:${access.actor.respondentId}`;

export function limitAutosave(request: Request, access: AssignmentAccess) {
  requireRateLimit(request, { prefix: `campaigns-answers:${who(access)}`, ...RATE_LIMIT_AUTOSAVE });
}

export function limitMutation(request: Request, access: AssignmentAccess) {
  requireRateLimit(request, { prefix: `campaigns-mut:${who(access)}`, ...RATE_LIMIT_MUTATION });
}

export function limitUpload(request: Request, access: AssignmentAccess) {
  requireRateLimit(request, { prefix: `campaigns-upload:${who(access)}`, ...RATE_LIMIT_SENSITIVE });
}

/** Routes par lien : `kind` sépare la sauvegarde automatique (large) du reste (strict). */
export function limitPublic(request: Request, kind: "read" | "answers" | "write") {
  const ip = getClientIp(request);
  const limits = kind === "answers" ? RATE_LIMIT_AUTOSAVE : RATE_LIMIT_SENSITIVE;
  requireRateLimit(request, { prefix: `campaigns-public-${kind}:${ip}`, ...limits });
}

/** Corps JSON borné : taille vérifiée avant lecture. */
export async function readJson(request: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new ApiError(413, "Requête trop volumineuse");
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "Requête trop volumineuse");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new ApiError(400, "Données illisibles");
  }
}

/** Dépôt multipart `requestCode` + `file`, taille annoncée bornée avant lecture. */
export async function readUpload(request: Request): Promise<{ requestCode: string; file: File }> {
  const length = request.headers.get("content-length");
  if (!length) throw new ApiError(411, "Longueur du corps requise");
  if (Number(length) > 11 * 1024 * 1024) throw new ApiError(413, "Le fichier dépasse 10 Mo");
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    throw new ApiError(400, "Envoi illisible");
  }
  const requestCode = data.get("requestCode");
  const file = data.get("file");
  if (typeof requestCode !== "string" || !requestCode) throw new ApiError(400, "Demande de fichier manquante");
  if (!(file instanceof File)) throw new ApiError(400, "Fichier manquant");
  return { requestCode, file };
}

/** Téléchargement : toujours en pièce jointe, jamais interprété ni mis en cache. */
export function fileResponse(file: { buffer: Buffer; name: string; mime: string }): Response {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Content-Length": String(file.buffer.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
