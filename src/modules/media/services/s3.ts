import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Media as s3Client, MEDIA_BUCKET as BUCKET } from "@/lib/s3";

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

export function getVersionOriginalKey(fileId: string, versionNumber: number, ext: string): string {
  return `media-files/${fileId}/v${versionNumber}/original.${ext}`;
}

export function getVersionThumbnailKey(fileId: string, versionNumber: number): string {
  return `media-files/${fileId}/v${versionNumber}/thumbnail.webp`;
}

// ─── Quarantine (upload direct navigateur → S3) ───────────────────────────

export function getQuarantineKey(eventId: string, quarantineId: string, ext: string): string {
  return `quarantine/media-events/${eventId}/${quarantineId}.${ext}`;
}

const PRESIGNED_PUT_EXPIRY = 300; // 5 min

export async function getSignedPutUrl(key: string, contentType: string, expiresIn = PRESIGNED_PUT_EXPIRY): Promise<string> {
  return getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn, signableHeaders: new Set(["content-type"]) },
  );
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function downloadFile(key: string): Promise<Buffer> {
  const resp = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!resp.Body) throw new Error(`S3 object not found: ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

// ─── Raw stream (for ZIP) ─────────────────────────────────────────────────

import type { Readable } from "node:stream";

export async function getS3ObjectStream(key: string): Promise<Readable> {
  const resp = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!resp.Body) throw new Error(`S3 object not found: ${key}`);
  return resp.Body as Readable;
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
