/**
 * Lecture disque de l'arborescence Audiobookshelf copiée sur la VM :
 *   <root>/cultes/<Dossier culte>/<pistes .mp3>
 *   <root>/predications/<Série ...>/<AAAA-MM-JJ_HHhMM_Titre.mp3>
 *
 * Renvoie une `Scan` que `buildManifest` (pur) transforme en manifeste d'import.
 * Les tags ID3 des prédications sont lus ici (I/O) pour rester hors des fonctions pures.
 */

import { readdir, stat } from "fs/promises";
import path from "path";
import { parsePredicationFile } from "./parse";
import { readId3 } from "./probe";
import type { Scan, ScanCulte, ScanPredication } from "./types";

async function readPredicationsDir(dir: string): Promise<ScanPredication[]> {
  const out: ScanPredication[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await readPredicationsDir(full)));
      continue;
    }
    const parsed = parsePredicationFile(entry.name);
    if (!parsed) continue;
    const [size, id3] = await Promise.all([stat(full), readId3(full)]);
    out.push({
      ...parsed,
      path: full,
      sizeBytes: size.size,
      artist: id3.artist,
      id3Title: id3.title,
    });
  }
  return out;
}

export async function scanRoot(root: string): Promise<Scan> {
  const cultesDir = path.join(root, "cultes");
  const predicationsDir = path.join(root, "predications");

  const culteEntries = await readdir(cultesDir, { withFileTypes: true });
  const cultes: ScanCulte[] = [];
  for (const entry of culteEntries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(cultesDir, entry.name);
    const fileEntries = (await readdir(dir, { withFileTypes: true })).filter((f) => f.isFile());
    const files = await Promise.all(
      fileEntries.map(async (f) => {
        const full = path.join(dir, f.name);
        const size = await stat(full);
        return { name: f.name, path: full, sizeBytes: size.size };
      })
    );
    cultes.push({ folder: entry.name, files });
  }

  const predications = await readPredicationsDir(predicationsDir);
  return { cultes, predications };
}
