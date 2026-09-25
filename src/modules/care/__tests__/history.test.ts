import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { toCareHistory } = await import("../services/history");

describe("toCareHistory", () => {
  it("lit le format lot 2 { action, from, to, assignee, note }", () => {
    const entries = toCareHistory([
      {
        id: "log-1",
        createdAt: new Date("2026-06-01T10:00:00Z"),
        user: { name: "Jean Dupont", displayName: null },
        details: { action: "reassign", from: "VALIDATED", to: "VALIDATED", assignee: "Alice Martin", note: "Contexte" },
      },
    ]);

    expect(entries).toEqual([
      {
        id: "log-1",
        action: "reassign",
        from: "VALIDATED",
        to: "VALIDATED",
        assignee: "Alice Martin",
        note: "Contexte",
        at: new Date("2026-06-01T10:00:00Z"),
        author: "Jean Dupont",
      },
    ]);
  });

  it("lit le format hérité lot 1 des demandes { transition: 'PENDING→VALIDATED' }", () => {
    const entries = toCareHistory([
      {
        id: "log-2",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        user: null,
        details: { transition: "PENDING→VALIDATED", assignedToId: "profile-1" },
      },
    ]);

    expect(entries).toEqual([
      { id: "log-2", action: null, from: "PENDING", to: "VALIDATED", assignee: null, note: null, at: new Date("2026-05-01T10:00:00Z"), author: null },
    ]);
  });

  it("lit le format hérité lot 1 des suivis { action } seul (sans from/to)", () => {
    const entries = toCareHistory([
      {
        id: "log-3",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        user: { name: null, displayName: "Secrétariat" },
        details: { action: "assign_counselor" },
      },
    ]);

    expect(entries[0]).toMatchObject({ action: "assign_counselor", from: null, to: null, author: "Secrétariat" });
  });

  it("ignore les entrées sans action ni transition reconnaissable", () => {
    const entries = toCareHistory([
      { id: "log-4", createdAt: new Date(), user: null, details: { subject: "Note libre" } },
    ]);
    expect(entries).toHaveLength(0);
  });

  it("trie par ordre chronologique", () => {
    const entries = toCareHistory([
      { id: "log-later", createdAt: new Date("2026-06-02T10:00:00Z"), user: null, details: { action: "complete", from: null, to: null } },
      { id: "log-earlier", createdAt: new Date("2026-06-01T10:00:00Z"), user: null, details: { action: "assign", from: null, to: null } },
    ]);
    expect(entries.map((e) => e.id)).toEqual(["log-earlier", "log-later"]);
  });
});
