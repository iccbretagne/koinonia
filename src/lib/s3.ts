import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const globalForS3 = globalThis as unknown as {
  s3: S3Client | undefined;
};

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
  new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });

if (process.env.NODE_ENV !== "production") globalForS3.s3 = s3;

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
