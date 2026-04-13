import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 as s3Client } from "@/lib/s3";

const BUCKET = process.env.S3_BUCKET ?? "";

// ─── URL expiry ────────────────────────────────────────────────────────────
const THUMBNAIL_URL_EXPIRY = 3600;   // 1h
const ORIGINAL_URL_EXPIRY  = 300;    // 5min
const DOWNLOAD_URL_EXPIRY  = 600;    // 10min

// ─── Key helpers ──────────────────────────────────────────────────────────

export type MediaContainer = "media-events" | "media-projects";

export function getPhotoOriginalKey(mediaEventId: string, photoId: string, ext: string): string {
  return `media-events/${mediaEventId}/photos/originals/${photoId}.${ext}`;
}

export function getPhotoThumbnailKey(mediaEventId: string, photoId: string): string {
  return `media-events/${mediaEventId}/photos/thumbnails/${photoId}.webp`;
}

export function getFileOriginalKey(
  container: MediaContainer,
  containerId: string,
  fileId: string,
  versionNumber: number,
  ext: string
): string {
  return `${container}/${containerId}/files/v${versionNumber}/${fileId}.${ext}`;
}

export function getFileThumbnailKey(
  container: MediaContainer,
  containerId: string,
  fileId: string,
  versionNumber: number
): string {
  return `${container}/${containerId}/files/v${versionNumber}/${fileId}.webp`;
}

export function getZipKey(mediaEventId: string, jobId: string): string {
  return `media-events/${mediaEventId}/zips/${jobId}.zip`;
}

// ─── Upload ────────────────────────────────────────────────────────────────

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

// ─── Signed URLs ──────────────────────────────────────────────────────────

export async function getSignedThumbnailUrl(key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: THUMBNAIL_URL_EXPIRY });
}

export async function getSignedOriginalUrl(key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: ORIGINAL_URL_EXPIRY });
}

export async function getSignedDownloadUrl(key: string, filename: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="${filename}"` }),
    { expiresIn: DOWNLOAD_URL_EXPIRY }
  );
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteMediaFile(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ─── Multipart upload ─────────────────────────────────────────────────────

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const resp = await s3Client.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }));
  if (!resp.UploadId) throw new Error("createMultipartUpload: no UploadId");
  return resp.UploadId;
}

export async function getSignedPartUrl(key: string, uploadId: string, partNumber: number, expiresIn: number): Promise<string> {
  return getSignedUrl(s3Client, new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  await s3Client.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
}
