/**
 * Ledger d'idempotence : une ligne JSON par culte importé avec succès, dans
 * `.ledger.jsonl` (git-ignoré, à côté du script). Une relance saute les dossiers
 * déjà présents. Clé métier = nom du dossier Audiobookshelf.
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
