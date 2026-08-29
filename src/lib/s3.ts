import { S3Client, DeleteObjectsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

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
  // Provide credentials as an async function (AwsCredentialIdentityProvider) rather
  // than a plain static object. This prevents the AWS SDK from also invoking the
  // default credential provider chain, which tries to fs.watch() ~/.aws/credentials
  // and fails on WSL2 with "Unable to add filesystem: <illegal path>".
  const accessKeyId = vars.accessKeyId || "";
  const secretAccessKey = vars.secretAccessKey || "";
  return new S3Client({
    endpoint: vars.endpoint,
    region: vars.region || "us-east-1",
    forcePathStyle: true,
    credentials: async () => ({ accessKeyId, secretAccessKey }),
  });
}

// ─── Client backups ───────────────────────────────────────────────────────────

export function isS3Configured(): boolean {
  return !!(
    process.env.BACKUP_S3_ENDPOINT &&
    process.env.BACKUP_S3_REGION &&
    process.env.BACKUP_S3_BUCKET &&
    process.env.BACKUP_S3_ACCESS_KEY_ID &&
    process.env.BACKUP_S3_SECRET_ACCESS_KEY
  );
}

export const s3 =
  globalForS3.s3 ??
  makeClient({
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    region: process.env.BACKUP_S3_REGION,
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  });

// ─── Client média (bucket + credentials dédiés — MEDIA_S3_* obligatoires) ────

export const MEDIA_BUCKET = process.env.MEDIA_S3_BUCKET ?? "";

export const s3Media =
  globalForS3.s3Media ??
  makeClient({
    endpoint:        process.env.MEDIA_S3_ENDPOINT,
    region:          process.env.MEDIA_S3_REGION,
    accessKeyId:     process.env.MEDIA_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForS3.s3 = s3;
  globalForS3.s3Media = s3Media;
}

/** Supprime plusieurs objets du bucket média (s3Media/MEDIA_BUCKET) en batch. */
export async function deleteMediaFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (!MEDIA_BUCKET) throw new Error("MEDIA_S3_BUCKET non configuré — variables MEDIA_S3_* requises");

  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    await s3Media.send(
      new DeleteObjectsCommand({
        Bucket: MEDIA_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      })
    );
  }
}

/**
 * Taille reelle d'un objet du bucket media, telle que S3 la constate — `null` si l'objet
 * n'existe pas. Sert a faire respecter la borne de taille cote serveur : une URL presignee
 * `PutObject` ne porte aucune contrainte de taille, la valeur annoncee par le client a la
 * signature ne garantit donc rien (spec 029).
 */
export async function getMediaObjectSize(key: string): Promise<number | null> {
  if (!MEDIA_BUCKET) throw new Error("MEDIA_S3_BUCKET non configuré — variables MEDIA_S3_* requises");

  try {
    const head = await s3Media.send(new HeadObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}
