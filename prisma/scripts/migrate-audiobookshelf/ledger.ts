/**
 * Ledger d'idempotence : une ou deux lignes JSON par culte, dans `.ledger.jsonl`
 * (git-ignoré, à côté du script). `importCulte()` écrit une entrée `status: "started"`
 * dès la création du service, puis une entrée `status: "done"` une fois l'import
 * terminé — la dernière entrée d'un dossier fait foi (voir `latestEntryByFolder`).
 * Une entrée sans `status` (écrite par une version antérieure du script, qui
 * n'écrivait qu'à la fin d'un import réussi) est traitée comme `"done"`.
 * Clé métier = nom du dossier Audiobookshelf.
 */

import { readFile, appendFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(HERE, ".ledger.jsonl");

export interface LedgerEntry {
  folder: string;
  serviceId: string;
  date: string;
  sequences: number;
  predicationMatched: boolean;
  at: string; // ISO
  status?: "started" | "done";
}

export async function readLedger(): Promise<LedgerEntry[]> {
  try {
    const raw = await readFile(LEDGER_PATH, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LedgerEntry);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function appendLedger(entry: LedgerEntry): Promise<void> {
  await appendFile(LEDGER_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function removeFromLedger(folder: string): Promise<void> {
  const kept = (await readLedger()).filter((e) => e.folder !== folder);
  await writeFile(LEDGER_PATH, kept.map((e) => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : ""), "utf8");
}

/** Dernière entrée connue pour un dossier (ordre du fichier), `undefined` si absent. */
export function latestEntryByFolder(entries: LedgerEntry[], folder: string): LedgerEntry | undefined {
  let latest: LedgerEntry | undefined;
  for (const entry of entries) {
    if (entry.folder === folder) latest = entry;
  }
  return latest;
}

/**
 * `true` si la dernière entrée du dossier représente un import terminé avec succès —
 * `status: "done"`, ou une entrée historique sans `status` (l'ancien script n'écrivait
 * qu'à la fin d'un import réussi). `false` si absente ou `status: "started"`.
 */
export function isFolderDone(entry: LedgerEntry | undefined): boolean {
  return entry !== undefined && (entry.status === "done" || entry.status === undefined);
}
