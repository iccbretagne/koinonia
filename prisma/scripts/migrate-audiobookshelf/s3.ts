/**
 * Dépôt S3 d'un fichier avec lecture de l'ETag réel.
 *
 * `publishAudioService` calcule `sourceHash = sha256(etag)` ; l'ETag doit donc être
 * celui que le bucket a effectivement attribué à l'objet, pas une valeur calculée à la
 * main (cf. `reflexion.md` §6). On réutilise le client et le bucket média de l'app.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Media, MEDIA_BUCKET } from "@/lib/s3";

/** Au-delà de cette taille, un upload simple n'est pas raisonnable — passer en multipart. */
const MAX_SIMPLE_PUT_BYTES = 512 * 1024 * 1024;

export async function putObjectWithEtag(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!MEDIA_BUCKET) {
    throw new Error("MEDIA_S3_BUCKET non configuré — variables MEDIA_S3_* requises");
  }
  if (body.length > MAX_SIMPLE_PUT_BYTES) {
    throw new Error(
      `Fichier trop volumineux pour un PutObject simple (${body.length} o > 512 Mo) : ${key}. ` +
        `Découper la source ou étendre le script au multipart.`
    );
  }

  const res = await s3Media.send(
    new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
  const etag = res.ETag?.replace(/^"|"$/g, "").trim() ?? "";
  if (!etag) throw new Error(`PutObject sans ETag renvoyé pour ${key}`);
  return etag;
}
