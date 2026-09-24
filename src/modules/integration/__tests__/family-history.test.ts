import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { toRequestHistory } = await import("../services/family-history");

const user = { name: "Alice", displayName: null };

function log(id: string, minute: number, details: Record<string, unknown>) {
  return { id, details, createdAt: new Date(Date.UTC(2026, 8, 23, 10, minute)), user };
}

describe("toRequestHistory", () => {
  it("conserve chaque cycle attente → reprise → attente sans écraser le précédent", () => {
    const entries = toRequestHistory([
      log("1", 0, { action: "wait", from: "SUBMITTED", to: "WAITING_RECONTACT" }),
      log("2", 1, { action: "resume", from: "WAITING_RECONTACT", to: "SUBMITTED" }),
      log("3", 2, { action: "wait", from: "SUBMITTED", to: "WAITING_RECONTACT" }),
      log("4", 3, { action: "resume", from: "WAITING_RECONTACT", to: "SUBMITTED" }),
    ]);
    expect(entries.map((e) => [e.action, e.from, e.to])).toEqual([
      ["wait", "SUBMITTED", "WAITING_RECONTACT"],
      ["resume", "WAITING_RECONTACT", "SUBMITTED"],
      ["wait", "SUBMITTED", "WAITING_RECONTACT"],
      ["resume", "WAITING_RECONTACT", "SUBMITTED"],
    ]);
  });

  it("indique la date et l'auteur, en préférant le nom d'affichage", () => {
    const [entry] = toRequestHistory([
      { ...log("1", 0, { action: "contact", from: "ASSIGNED", to: "CONTACTED" }), user: { name: "A. B.", displayName: "Alice" } },
    ]);
    expect(entry.author).toBe("Alice");
    expect(entry.at).toEqual(new Date(Date.UTC(2026, 8, 23, 10, 0)));
  });

  it("garde les relances consignées (même statut) avec leur note, écarte notes et corrections", () => {
    const entries = toRequestHistory([
      log("1", 0, { action: "relance", from: "WAITING_MISSION", to: "WAITING_MISSION", note: "mail envoyé" }),
      log("2", 1, { action: "note", from: "WAITING_MISSION", to: "WAITING_MISSION" }),
      log("3", 2, { action: "edit", from: "WAITING_MISSION", to: "WAITING_MISSION" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "relance", note: "mail envoyé" });
  });

  it("affiche les entrées antérieures à la spec 051 (journal réduit à { action })", () => {
    const entries = toRequestHistory([
      log("1", 0, { action: "assign" }),
      log("2", 1, { action: "note" }),
      log("3", 2, { action: "abandon" }),
    ]);
    expect(entries.map((e) => [e.from, e.to])).toEqual([
      [null, "ASSIGNED"],
      [null, "ABANDONED"],
    ]);
  });

  it("trie chronologiquement", () => {
    const entries = toRequestHistory([
      log("b", 5, { action: "contact", from: "ASSIGNED", to: "CONTACTED" }),
      log("a", 1, { action: "assign", from: "SUBMITTED", to: "ASSIGNED" }),
    ]);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
