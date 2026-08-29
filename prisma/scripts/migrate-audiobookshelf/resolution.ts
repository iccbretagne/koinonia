/**
 * Décide, pour un ensemble de dossiers candidats, ce qu'il faut en faire à partir de
 * l'état du ledger — pure, sans I/O, testable indépendamment de Prisma/S3/ffprobe.
 */

import { isFolderDone, latestEntryByFolder, type LedgerEntry } from "./ledger";

export interface FolderClassification {
  /** Aucune entrée pour ce dossier : à importer. */
  toImport: string[];
  /** Dernière entrée `status: "done"` (ou historique sans `status`) : déjà importé. */
  alreadyDone: string[];
  /** Dernière entrée `status: "started"` sans `"done"` associée : tentative inaboutie, à purger avant reprise. */
  pendingCleanup: string[];
}

export function classifyFolders(folders: string[], allEntries: LedgerEntry[]): FolderClassification {
  const result: FolderClassification = { toImport: [], alreadyDone: [], pendingCleanup: [] };

  for (const folder of folders) {
    const entry = latestEntryByFolder(allEntries, folder);
    if (!entry) {
      result.toImport.push(folder);
    } else if (isFolderDone(entry)) {
      result.alreadyDone.push(folder);
    } else {
      result.pendingCleanup.push(folder);
    }
  }

  return result;
}
