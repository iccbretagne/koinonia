import { describe, it, expect } from "vitest";
import { classifyFolders } from "./resolution";
import type { LedgerEntry } from "./ledger";

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  folder: "Culte du 01 01 2025",
  serviceId: "svc-1",
  date: "2025-01-01",
  sequences: 5,
  predicationMatched: true,
  at: "2025-01-01T10:00:00.000Z",
  ...overrides,
});

describe("classifyFolders", () => {
  it("dossier sans entrée -> toImport", () => {
    const result = classifyFolders(["Culte du 01 01 2025"], []);
    expect(result).toEqual({ toImport: ["Culte du 01 01 2025"], alreadyDone: [], pendingCleanup: [] });
  });

  it("dossier avec entrée done -> alreadyDone", () => {
    const result = classifyFolders(["Culte du 01 01 2025"], [entry({ status: "done" })]);
    expect(result).toEqual({ toImport: [], alreadyDone: ["Culte du 01 01 2025"], pendingCleanup: [] });
  });

  it("dossier avec entrée historique sans status -> alreadyDone", () => {
    const legacy = entry();
    delete (legacy as Partial<LedgerEntry>).status;
    const result = classifyFolders(["Culte du 01 01 2025"], [legacy]);
    expect(result).toEqual({ toImport: [], alreadyDone: ["Culte du 01 01 2025"], pendingCleanup: [] });
  });

  it("dossier avec entrée started seule -> pendingCleanup, jamais toImport", () => {
    const result = classifyFolders(["Culte du 01 01 2025"], [entry({ status: "started" })]);
    expect(result).toEqual({ toImport: [], alreadyDone: [], pendingCleanup: ["Culte du 01 01 2025"] });
  });

  it("dossier avec started puis done -> alreadyDone (la dernière entrée fait foi)", () => {
    const started = entry({ status: "started" });
    const done = entry({ status: "done", at: "2025-01-01T10:05:00.000Z" });
    const result = classifyFolders(["Culte du 01 01 2025"], [started, done]);
    expect(result).toEqual({ toImport: [], alreadyDone: ["Culte du 01 01 2025"], pendingCleanup: [] });
  });

  it("plusieurs dossiers mélangés -> classement indépendant de chacun", () => {
    const entries: LedgerEntry[] = [
      entry({ folder: "neuf" }),
      entry({ folder: "fait", status: "done" }),
      entry({ folder: "en-panne", status: "started" }),
    ].filter((e) => e.folder !== "neuf"); // "neuf" n'a volontairement aucune entrée

    const result = classifyFolders(["neuf", "fait", "en-panne"], entries);
    expect(result).toEqual({
      toImport: ["neuf"],
      alreadyDone: ["fait"],
      pendingCleanup: ["en-panne"],
    });
  });
});
