import sharp from "sharp";
import { ApiError } from "@/lib/api-utils";
import { deleteMediaFile, downloadFile, uploadFile } from "@/modules/storage";
import { PHOTO_MAX_BYTES } from "../schemas";

const MAX_INPUT_PIXELS = 50_000_000;
/** Formats décodés acceptés : photos de téléphone et d'appareil courants, jamais de SVG. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

/**
 * Contrôle et réencode la photo d'identité (spec 073) : le format **décodé** fait foi (le type
 * déclaré est ignoré), l'orientation EXIF est appliquée, puis l'image est recadrée en 600×800 et
 * réencodée en JPEG — ce qui retire toutes les métadonnées (position GPS comprise).
 */
export async function normalizePhoto(buffer: Buffer): Promise<Buffer> {
  if (buffer.length === 0) throw new ApiError(400, "La photo est requise.");
  if (buffer.length > PHOTO_MAX_BYTES) throw new ApiError(400, "Photo trop lourde (8 Mo maximum).");
  let format: string | undefined;
  try {
    format = (await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new ApiError(400, "Photo illisible : envoie une image JPEG, PNG, WebP ou HEIC.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ApiError(400, "Format non accepté : envoie une image JPEG, PNG, WebP ou HEIC.");
  }
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize(600, 800, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ApiError(400, "Photo illisible : envoie une image JPEG, PNG, WebP ou HEIC.");
  }
}

export function servingPhotoKey(churchId: string, applicationId: string): string {
  return `serving/${churchId}/${applicationId}.jpg`;
}

export async function storePhoto(key: string, jpeg: Buffer): Promise<void> {
  await uploadFile(key, jpeg, "image/jpeg");
}

export async function readPhoto(key: string): Promise<Buffer> {
  return downloadFile(key);
}

export async function deletePhoto(key: string): Promise<void> {
  await deleteMediaFile(key);
}
