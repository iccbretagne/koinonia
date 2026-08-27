import { ApiError } from "@/lib/errors";

export const ALLOWED_COVER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateCoverFile(mimeType: string, size: number): void {
  if (!ALLOWED_COVER_MIME_TYPES.includes(mimeType)) {
    throw new ApiError(400, `Type de fichier non supporté : ${mimeType}`);
  }
  if (size > MAX_COVER_SIZE) {
    throw new ApiError(400, `Fichier trop lourd : ${Math.round(size / 1024 / 1024)}MB (max 10MB)`);
  }
}

export function getCoverExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mimeType] ?? "jpg";
}

export function getDefaultCoverKey(churchId: string, coverId: string, ext: string): string {
  return `audio-settings/${churchId}/cover-${coverId}.${ext}`;
}
