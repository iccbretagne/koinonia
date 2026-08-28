/**
 * Livraison HTTP d'une rendition audio en cache (ADR-0008), partagée par la route de streaming
 * interne (`audio:listen`) et la route publique (token de partage).
 *
 * Deux modes, selon l'infrastructure déployée :
 *  - **Autonome (livré)** : la route sert le flux elle-même, en `Range` HTTP natif. C'est le
 *    mode utilisé sur l'infrastructure actuelle (Traefik attaque directement le process Node).
 *  - **Délégué (point de sortie, désactivé par défaut)** : si `AUDIO_XACCEL_LOCATION` est
 *    défini, la route répond un corps vide portant `X-Accel-Redirect`, et un nginx placé devant
 *    le process sert le fichier en `sendfile`. Activer ce mode suppose d'insérer nginx dans la
 *    chaîne — non fait aujourd'hui (plan.md § Services / logique métier).
 */
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { getCachedRenditionPath, getCacheFileName, touchRenditionAccess } from "./rendition-cache";
import { getS3ObjectStream } from "@/modules/storage";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=31536000, immutable",
} as const;

function parseRange(rangeHeader: string | null, size: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  let start = startStr ? parseInt(startStr, 10) : NaN;
  let end = endStr ? parseInt(endStr, 10) : size - 1;

  if (startStr === "" && endStr !== "") {
    // Suffixe "bytes=-500" : les 500 derniers octets.
    const suffixLength = parseInt(endStr, 10);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= size) {
    return null;
  }
  return { start, end };
}

/**
 * Construit la réponse HTTP pour une rendition identifiée par sa clé S3, en honorant l'en-tête
 * `Range` — le seek et la reprise d'écoute en dépendent (spec 021).
 */
export async function buildRenditionResponse(s3Key: string, rangeHeader: string | null): Promise<Response> {
  const xAccelLocation = process.env.AUDIO_XACCEL_LOCATION;
  if (xAccelLocation) {
    await touchRenditionAccess(s3Key);
    return new Response(null, {
      status: 200,
      headers: {
        "X-Accel-Redirect": `${xAccelLocation}/${getCacheFileName(s3Key)}`,
        "Content-Type": "audio/mpeg",
        ...CACHE_HEADERS,
      },
    });
  }

  const cachedPath = await getCachedRenditionPath(s3Key);
  if (cachedPath) {
    return streamLocalFile(cachedPath, rangeHeader);
  }

  // Cache indisponible (disque plein, droits) : repli sur le flux S3 direct, sans Range —
  // l'écoute reste possible, seul le seek est dégradé pour cette requête.
  const body = await getS3ObjectStream(s3Key);
  return new Response(Readable.toWeb(body) as ReadableStream, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", ...CACHE_HEADERS },
  });
}

function streamLocalFile(filePath: string, rangeHeader: string | null): Response {
  const { size } = statSync(filePath);
  const range = parseRange(rangeHeader, size);

  if (rangeHeader && !range) {
    return new Response("Plage invalide", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };
  const nodeStream = createReadStream(filePath, { start, end });
  const body = Readable.toWeb(nodeStream) as ReadableStream;

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
    ...CACHE_HEADERS,
  };

  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: 206, headers });
  }

  return new Response(body, { status: 200, headers });
}
