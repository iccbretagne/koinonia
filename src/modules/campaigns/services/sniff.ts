import JSZip from "jszip";

/**
 * Type d'un fichier de campagne (spec 090) déterminé par son **contenu**, jamais par son nom ni
 * par le type annoncé : PDF, XLSX sans macro, CSV texte. Le contenu n'est pas lu au-delà.
 */

export const CAMPAIGN_FILE_MAX_BYTES = 10 * 1024 * 1024;

export interface SniffedFile {
  mime: string;
  ext: "pdf" | "xlsx" | "csv";
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
/** Octets non définis en Windows-1252. */
const CP1252_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

const startsWith = (bytes: Uint8Array, magic: readonly number[]) => magic.every((b, i) => bytes[i] === b);

/** Caractère de contrôle hors tabulation et fins de ligne. */
const isControl = (code: number) => (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;

async function isXlsx(bytes: Uint8Array): Promise<boolean> {
  try {
    // Lecture du répertoire central seulement : aucune entrée n'est décompressée.
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    if (names.some((n) => n.toLowerCase().endsWith("vbaproject.bin"))) return false;
    return zip.file("[Content_Types].xml") !== null && zip.file("xl/workbook.xml") !== null;
  } catch {
    return false;
  }
}

function isCsv(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes.includes(0)) return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    for (const ch of text) if (isControl(ch.codePointAt(0) ?? 0)) return false;
    return true;
  } catch {
    // Pas de l'UTF-8 : accepté comme Windows-1252 s'il ne contient que du texte.
    return !bytes.some((b) => isControl(b) || CP1252_UNDEFINED.has(b));
  }
}

export async function sniffCampaignFile(bytes: Uint8Array, fileName: string): Promise<SniffedFile | null> {
  if (bytes.length === 0 || bytes.length > CAMPAIGN_FILE_MAX_BYTES) return null;
  if (startsWith(bytes, PDF_MAGIC)) return { mime: "application/pdf", ext: "pdf" };
  if (startsWith(bytes, ZIP_MAGIC)) {
    return (await isXlsx(bytes))
      ? { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" }
      : null;
  }
  if (fileName.toLowerCase().endsWith(".csv") && isCsv(bytes)) return { mime: "text/csv", ext: "csv" };
  return null;
}
