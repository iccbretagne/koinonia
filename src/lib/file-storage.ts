/**
 * Abstraction de stockage fichiers pour les pièces jointes comptabilité.
 * - Si ACCOUNTING_S3_BUCKET est défini → S3/MinIO
 * - Sinon → système de fichiers local : `FILE_STORAGE_DIR` s'il est défini (hors du dossier de la
 *   release, ex. `/opt/koinonia/shared/uploads`), à défaut `<cwd>/uploads/accounting` (dev
 *   uniquement : en déploiement, le cwd change à chaque release et les fichiers « disparaissent »)
 */
import path from "node:path";
import fs from "node:fs/promises";

// Les deux nommages sont acceptés : `…_ACCESS_KEY`/`…_SECRET_KEY` (historique) et
// `…_ACCESS_KEY_ID`/`…_SECRET_ACCESS_KEY` (celui de MEDIA_S3_*). Un nom non reconnu faisait
// retomber silencieusement sur le disque de la release (images de site perdues au déploiement).
const S3_ACCESS_KEY = process.env.ACCOUNTING_S3_ACCESS_KEY || process.env.ACCOUNTING_S3_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.ACCOUNTING_S3_SECRET_KEY || process.env.ACCOUNTING_S3_SECRET_ACCESS_KEY;

export const S3_CONFIGURED = !!(process.env.ACCOUNTING_S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY);

const LOCAL_BASE = process.env.FILE_STORAGE_DIR
  ? path.resolve(process.env.FILE_STORAGE_DIR)
  : path.join(process.cwd(), "uploads", "accounting");

if (!S3_CONFIGURED && !process.env.FILE_STORAGE_DIR && process.env.NODE_ENV === "production") {
  console.warn(`[file-storage] ACCOUNTING_S3_* incomplet (BUCKET + ACCESS_KEY[_ID] + SECRET[_ACCESS]_KEY) et FILE_STORAGE_DIR absent : fichiers écrits dans ${LOCAL_BASE}, perdus au prochain déploiement`);
}

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

/** Types qu'un navigateur peut afficher sans risque (spec 089) : jamais de HTML ni de SVG. */
const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * URL de lecture d'une pièce. `inline` (spec 089) demande l'affichage dans le navigateur au lieu
 * du téléchargement, et n'est honoré que pour un type sûr (`mimeType`) ; sinon téléchargement.
 */
export async function getFileUrl(
  s3Key: string,
  filename: string,
  options: { inline?: boolean; mimeType?: string } = {}
): Promise<string> {
  const inline = !!options.inline && !!options.mimeType && INLINE_TYPES.has(options.mimeType);
  const disposition = `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(filename)}"`;
  if (S3_CONFIGURED) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const s3 = await makeS3Client();
    return getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket:                     process.env.ACCOUNTING_S3_BUCKET!,
        Key:                        s3Key,
        ResponseContentDisposition: disposition,
        ...(inline ? { ResponseContentType: options.mimeType } : {}),
      }),
      { expiresIn: 300 }
    );
  } else {
    // In local mode, serve via API route
    if (inline) return `/api/accounting/attachments/local?key=${encodeURIComponent(s3Key)}&filename=${encodeURIComponent(filename)}&inline=1`;
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

/** Contenu d'un fichier stocké (S3 ou local), `null` s'il est introuvable. */
export async function readStoredFile(s3Key: string): Promise<Buffer | null> {
  if (S3_CONFIGURED) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await makeS3Client();
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: process.env.ACCOUNTING_S3_BUCKET!, Key: s3Key }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (error) {
      if ((error as { name?: string }).name !== "NoSuchKey") console.error(`[file-storage] lecture S3 ${s3Key} :`, (error as Error).message);
      return null;
    }
  }
  const localPath = path.join(LOCAL_BASE, ...s3Key.split("/").slice(1));
  return fs.readFile(localPath).catch(() => null);
}

/** Le fichier existe-t-il dans le stockage ? (contrôle des images d'un site avant publication) */
export async function storedFileExists(s3Key: string): Promise<boolean> {
  if (S3_CONFIGURED) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await makeS3Client();
    return s3.send(new HeadObjectCommand({ Bucket: process.env.ACCOUNTING_S3_BUCKET!, Key: s3Key })).then(() => true, () => false);
  }
  return fs.access(path.join(LOCAL_BASE, ...s3Key.split("/").slice(1))).then(() => true, () => false);
}

export async function serveLocalFile(s3Key: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const localPath = path.join(LOCAL_BASE, ...s3Key.split("/").slice(1));
  try {
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).toLowerCase();
    let mimeType = "image/jpeg";
    if (ext === ".pdf") mimeType = "application/pdf";
    else if (ext === ".png") mimeType = "image/png";
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
      accessKeyId:     S3_ACCESS_KEY!,
      secretAccessKey: S3_SECRET_KEY!,
    },
    forcePathStyle: !!process.env.ACCOUNTING_S3_ENDPOINT,
  });
}
