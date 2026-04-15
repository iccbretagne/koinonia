import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const globalForS3 = globalThis as unknown as {
  s3: S3Client | undefined;
  s3Media: S3Client | undefined;
};

function makeClient(vars: {
  endpoint: string | undefined;
  region: string | undefined;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
}): S3Client {
  return new S3Client({
    endpoint: vars.endpoint,
    region: vars.region || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: vars.accessKeyId || "",
      secretAccessKey: vars.secretAccessKey || "",
    },
  });
}

// ─── Client backups ───────────────────────────────────────────────────────────

export function isS3Configured(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_REGION &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

export const s3 =
  globalForS3.s3 ??
  makeClient({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  });

// ─── Client média (bucket + credentials séparés) ─────────────────────────────
// Utilise MEDIA_S3_* si définis, sinon fallback sur les vars backup (bucket unique).

export function isMediaS3Configured(): boolean {
  // Configuré si les vars media OU les vars backup sont présentes
  return !!(
    (process.env.MEDIA_S3_ENDPOINT || process.env.S3_ENDPOINT) &&
    (process.env.MEDIA_S3_BUCKET   || process.env.S3_BUCKET)   &&
    (process.env.MEDIA_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID) &&
    (process.env.MEDIA_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY)
  );
}

export const MEDIA_BUCKET =
  process.env.MEDIA_S3_BUCKET || process.env.S3_BUCKET || "";

export const s3Media =
  globalForS3.s3Media ??
  makeClient({
    endpoint:        process.env.MEDIA_S3_ENDPOINT        || process.env.S3_ENDPOINT,
    region:          process.env.MEDIA_S3_REGION          || process.env.S3_REGION,
    accessKeyId:     process.env.MEDIA_S3_ACCESS_KEY_ID   || process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForS3.s3 = s3;
  globalForS3.s3Media = s3Media;
}

/** Supprime plusieurs objets S3 en une requête batch (max 1000 clés par appel). */
export async function deleteFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return; // S3 non configuré — no-op en dev

  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      })
    );
  }
}
