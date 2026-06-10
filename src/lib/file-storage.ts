/**
 * Abstraction de stockage fichiers pour les pièces jointes comptabilité.
 * - Si ACCOUNTING_S3_BUCKET est défini → S3/MinIO
 * - Sinon → système de fichiers local (dev uniquement, non adapté multi-serveurs)
 */
import path from "path";
import fs from "fs/promises";

export const S3_CONFIGURED = !!(
  process.env.ACCOUNTING_S3_BUCKET &&
  process.env.ACCOUNTING_S3_ACCESS_KEY &&
  process.env.ACCOUNTING_S3_SECRET_KEY
);

const LOCAL_BASE = path.join(process.cwd(), "uploads", "accounting");

export async function storeFile(s3Key: string, buffer: Buffer, _mimeType: string): Promise<void> {
  if (S3_CONFIGURED) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await makeS3Client();
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.ACCOUNTING_S3_BUCKET!,
      Key:         s3Key,
      Body:        buffer,
      ContentType: _mimeType,
    }));
  } else {
    const localPath = path.join(LOCAL_BASE, ...s3Key.split("/").slice(1));
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);
  }
}

export async function getFileUrl(s3Key: string, filename: string): Promise<string> {
  if (S3_CONFIGURED) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const s3 = await makeS3Client();
    return getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket:                     process.env.ACCOUNTING_S3_BUCKET!,
        Key:                        s3Key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      }),
      { expiresIn: 300 }
    );
  } else {
    // In local mode, serve via API route
    return `/api/accounting/attachments/local?key=${encodeURIComponent(s3Key)}&filename=${encodeURIComponent(filename)}`;
  }
}

export async function deleteFile(s3Key: string): Promise<void> {
  if (S3_CONFIGURED) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await makeS3Client();
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.ACCOUNTING_S3_BUCKET!, Key: s3Key }));
  } else {
    const localPath = path.join(LOCAL_BASE, ...s3Key.split("/").slice(1));
    await fs.unlink(localPath).catch(() => {});
  }
}

export async function serveLocalFile(s3Key: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const localPath = path.join(LOCAL_BASE, ...s3Key.split("/").slice(1));
  try {
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeType = ext === ".pdf" ? "application/pdf"
      : ext === ".png" ? "image/png"
      : "image/jpeg";
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

async function makeS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region:   process.env.ACCOUNTING_S3_REGION ?? "eu-west-3",
    endpoint: process.env.ACCOUNTING_S3_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.ACCOUNTING_S3_ACCESS_KEY!,
      secretAccessKey: process.env.ACCOUNTING_S3_SECRET_KEY!,
    },
    forcePathStyle: !!process.env.ACCOUNTING_S3_ENDPOINT,
  });
}
