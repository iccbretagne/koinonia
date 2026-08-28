/**
 * Sondage audio via `ffprobe` (durée + tags ID3). Binaire système par défaut,
 * surchargable par `FFPROBE_PATH` (utile pour pointer celui d'Audiobookshelf :
 * `/usr/share/audiobookshelf/ffprobe`).
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

/** Vérifie que `ffprobe` répond ; message actionnable sinon. */
export async function assertFfprobe(): Promise<void> {
  try {
    await execFileAsync(FFPROBE, ["-version"]);
  } catch {
    throw new Error(
      `ffprobe introuvable (« ${FFPROBE} »). Installez ffmpeg ou définissez FFPROBE_PATH ` +
        `(ex. /usr/share/audiobookshelf/ffprobe).`
    );
  }
}

/** Durée du fichier en millisecondes (arrondi). */
export async function probeDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ]);
  const seconds = parseFloat(JSON.parse(stdout)?.format?.duration ?? "0");
  return Math.round(seconds * 1000);
}

/** Tags ID3 utiles pour la substitution prédication. */
export async function readId3(filePath: string): Promise<{ artist: string | null; title: string | null }> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format_tags",
    "-of",
    "json",
    filePath,
  ]);
  const tags: Record<string, unknown> = JSON.parse(stdout)?.format?.tags ?? {};
  const pick = (name: string): string | null => {
    for (const key of Object.keys(tags)) {
      if (key.toLowerCase() === name) {
        const value = String(tags[key]).trim();
        return value || null;
      }
    }
    return null;
  };
  return { artist: pick("artist"), title: pick("title") };
}
