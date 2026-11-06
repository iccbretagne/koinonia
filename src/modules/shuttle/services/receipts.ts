import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-utils";
import { RECEIPT_MAX_BYTES } from "../schemas";

/**
 * Justificatifs de la navette (spec 073) : photo prise au téléphone ou document existant (scan,
 * PDF). Le type est déterminé par la **signature du fichier**, jamais par le type déclaré.
 */

export interface StoredReceipt {
  receiptKey: string;
  receiptName: string;
  receiptMime: string;
  receiptSize: number;
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Type réel d'un fichier d'après ses premiers octets, `null` si non accepté. */
export function sniffReceiptType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

/** Contrôle et stocke un justificatif ; renvoie les champs à enregistrer sur la ligne. */
export async function storeReceipt(churchId: string, file: File): Promise<StoredReceipt> {
  if (file.size === 0) throw new ApiError(400, "Justificatif vide");
  if (file.size > RECEIPT_MAX_BYTES) throw new ApiError(400, "Le justificatif dépasse 10 Mo.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffReceiptType(bytes);
  if (!mime) {
    throw new ApiError(400, "Justificatif non accepté : photo (JPEG, PNG, WebP) ou PDF uniquement.");
  }
  const receiptKey = `shuttle/${churchId}/${Date.now()}-${randomUUID()}.${EXTENSION[mime]}`;
  const { storeFile } = await import("@/lib/file-storage");
  await storeFile(receiptKey, Buffer.from(bytes), mime);
  const baseName = (file.name || "justificatif").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 200);
  return { receiptKey, receiptName: baseName, receiptMime: mime, receiptSize: file.size };
}

/** Contenu d'un justificatif stocké. */
export async function readReceipt(key: string): Promise<Buffer | null> {
  const { readStoredFile } = await import("@/lib/file-storage");
  return readStoredFile(key);
}
