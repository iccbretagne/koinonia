import { describe, it, expect, afterEach } from "vitest";
import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  readLedger,
  appendLedger,
  removeFromLedger,
  latestEntryByFolder,
  isFolderDone,
  type LedgerEntry,
} from "./ledger";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(HERE, ".ledger.jsonl");

const baseEntry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  folder: "Culte du 01 01 2025",
  serviceId: "svc-1",
  date: "2025-01-01",
  sequences: 5,
  predicationMatched: true,
  at: "2025-01-01T10:00:00.000Z",
  ...overrides,
});

describe("latestEntryByFolder", () => {
  it("retourne undefined si aucune entrée pour le dossier", () => {
    expect(latestEntryByFolder([baseEntry({ folder: "autre" })], "Culte du 01 01 2025")).toBeUndefined();
  });

  it("retourne la dernière entrée dans l'ordre du tableau pour un dossier avec plusieurs entrées", () => {
    const started = baseEntry({ status: "started" });
    const done = baseEntry({ status: "done", at: "2025-01-01T10:05:00.000Z" });
    expect(latestEntryByFolder([started, done], "Culte du 01 01 2025")).toBe(done);
  });
});

describe("isFolderDone", () => {
  it("true pour status: done", () => {
    expect(isFolderDone(baseEntry({ status: "done" }))).toBe(true);
  });

  it("false pour status: started", () => {
    expect(isFolderDone(baseEntry({ status: "started" }))).toBe(false);
  });

  it("true pour une entrée historique sans status (compat ascendante)", () => {
    const legacy = baseEntry();
    delete (legacy as Partial<LedgerEntry>).status;
    expect(isFolderDone(legacy)).toBe(true);
  });

  it("false si aucune entrée", () => {
    expect(isFolderDone(undefined)).toBe(false);
  });
});

describe("appendLedger / readLedger / removeFromLedger", () => {
  afterEach(async () => {
    await rm(LEDGER_PATH, { force: true });
  });

  it("round-trip : une entrée ajoutée est relue telle quelle", async () => {
    const entry = baseEntry({ status: "started" });
    await appendLedger(entry);
    expect(await readLedger()).toEqual([entry]);
  });

  it("removeFromLedger retire toutes les lignes du dossier (started + done)", async () => {
    const started = baseEntry({ status: "started" });
    const done = baseEntry({ status: "done", at: "2025-01-01T10:05:00.000Z" });
    const other = baseEntry({ folder: "autre culte", status: "done" });
    await appendLedger(started);
    await appendLedger(done);
    await appendLedger(other);

    await removeFromLedger("Culte du 01 01 2025");

    expect(await readLedger()).toEqual([other]);
  });

  it("readLedger retourne [] si le fichier n'existe pas", async () => {
    expect(await readLedger()).toEqual([]);
  });
});
