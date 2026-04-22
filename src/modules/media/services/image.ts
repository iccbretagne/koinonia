import sharp from "sharp";
import { ApiError } from "@/lib/api-utils";

export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50 MB

export interface ProcessedImage {
  original: Buffer;
  thumbnail: Buffer;
  metadata: { width: number; height: number; format: string };
}

/** Traite une image : rotation EXIF + JPEG 90% + miniature WebP 1200px. */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new ApiError(400, "Impossible de lire les métadonnées de l'image");
  }

  const original = await image.rotate().jpeg({ quality: 90 }).toBuffer();
  const thumbnail = await sharp(buffer)
    .rotate()
    .resize(1200, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    original,
    thumbnail,
    metadata: { width: metadata.width, height: metadata.height, format: metadata.format },
  };
}

export function validatePhotoFile(_filename: string, mimeType: string, size: number): void {
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(mimeType)) {
    throw new ApiError(400, `Type de fichier non supporté : ${mimeType}`);
  }
  if (size > MAX_PHOTO_SIZE) {
    throw new ApiError(400, `Fichier trop lourd : ${Math.round(size / 1024 / 1024)}MB (max 50MB)`);
  }
}

export function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mimeType] ?? "jpg";
}
