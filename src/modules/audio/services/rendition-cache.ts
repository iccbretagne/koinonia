/**
 * Cache disque local des renditions audio (ADR-0008) — une rendition est immuable une fois
 * produite (`sourceHash`), donc idéale à cacher : téléchargée depuis S3 au premier accès,
 * servie localement ensuite, sans invalidation à orchestrer.
 *
 * Le contrôle d'accès (token de partage, appartenance à l'église, statut PUBLISHED) reste
 * entièrement en amont, dans les routes appelantes — ce module ne fait qu'accélérer la
 * livraison d'un fichier déjà autorisé.
 */
import { createHash } from "crypto";
import { mkdir, rename, rm, stat, utimes, readdir } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { tmpdir } from "os";
import { pipeline } from "stream/promises";
import { getS3ObjectStream } from "@/modules/storage";

const CACHE_DIR = process.env.AUDIO_CACHE_DIR || path.join(tmpdir(), "koinonia-audio-cache");
const MAX_BYTES = Number(process.env.AUDIO_CACHE_MAX_BYTES) || 5 * 1024 * 1024 * 1024; // 5 Go

/** Dédoublonne les téléchargements concurrents d'une même clé S3. */
const inFlight = new Map<string, Promise<string>>();

function cacheFileName(s3Key: string): string {
  return createHash("sha1").update(s3Key).digest("hex") + ".mp3";
}

function cachePath(s3Key: string): string {
  return path.join(CACHE_DIR, cacheFileName(s3Key));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadToCache(s3Key: string, destination: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const partPath = `${destination}.part`;
  const body = await getS3ObjectStream(s3Key);
  await pipeline(body, createWriteStream(partPath));
  // Rename atomique : un lecteur ne voit jamais un fichier incomplet.
  await rename(partPath, destination);
}

async function evictIfOverBudget(): Promise<void> {
  try {
    const entries = await readdir(CACHE_DIR);
    const stats = await Promise.all(
      entries.map(async (name) => {
        const filePath = path.join(CACHE_DIR, name);
        const s = await stat(filePath);
        return { filePath, size: s.size, atimeMs: s.atime.getTime() };
      })
    );
    let total = stats.reduce((sum, s) => sum + s.size, 0);
    if (total <= MAX_BYTES) return;

    // Éviction LRU : les fichiers les moins récemment servis (mtime/atime rafraîchi à chaque
    // accès autorisé) partent en premier.
    const sorted = stats.sort((a, b) => a.atimeMs - b.atimeMs);
    for (const entry of sorted) {
      if (total <= MAX_BYTES) break;
      await rm(entry.filePath, { force: true });
      total -= entry.size;
    }
  } catch {
    // Le budget de cache n'est pas critique — une erreur d'éviction ne doit jamais faire
    // échouer une lecture.
  }
}

/**
 * Chemin local d'une rendition, téléchargée depuis S3 au premier accès. Retombe sur `null` si
 * le cache est indisponible (disque plein, droits) — l'appelant doit alors servir le flux S3
 * direct : le cache accélère l'écoute, il ne la conditionne jamais.
 */
export async function getCachedRenditionPath(s3Key: string): Promise<string | null> {
  const destination = cachePath(s3Key);

  if (await exists(destination)) {
    await touchRenditionAccess(s3Key);
    return destination;
  }

  let pending = inFlight.get(s3Key);
  if (!pending) {
    pending = downloadToCache(s3Key, destination)
      .then(() => destination)
      .finally(() => inFlight.delete(s3Key));
    inFlight.set(s3Key, pending);
  }

  try {
    const filePath = await pending;
    await evictIfOverBudget();
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Rafraîchit l'horodatage d'accès d'une rendition déjà en cache — sert de base à l'éviction
 * LRU. À appeler à chaque requête autorisée, y compris quand les octets sont livrés par un
 * mécanisme qui ne passe pas par `getCachedRenditionPath` (ex. délégation nginx).
 */
export async function touchRenditionAccess(s3Key: string): Promise<void> {
  try {
    const now = new Date();
    await utimes(cachePath(s3Key), now, now);
  } catch {
    // Fichier absent du cache ou disque indisponible — sans conséquence.
  }
}

/**
 * Écrit directement une rendition en cache — utilisé par le worker de rendu, qui a déjà le
 * fichier produit sur son propre disque au moment de l'envoyer sur S3 (pré-chauffage, plan.md).
 */
export async function primeRenditionCache(s3Key: string, sourcePath: string): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const destination = cachePath(s3Key);
    const partPath = `${destination}.part`;
    const { copyFile } = await import("fs/promises");
    await copyFile(sourcePath, partPath);
    await rename(partPath, destination);
  } catch {
    // Le pré-chauffage est un accélérateur — son échec ne doit jamais faire échouer le rendu.
  }
}

/** Chemin absolu utilisé pour le cache — exposé pour la configuration nginx (plan.md). */
export function getCacheDir(): string {
  return CACHE_DIR;
}

export function getCacheFileName(s3Key: string): string {
  return cacheFileName(s3Key);
}
