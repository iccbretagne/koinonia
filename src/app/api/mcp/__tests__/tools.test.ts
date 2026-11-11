/**
 * Tests — outils MCP (spec 081) : liste blanche, filtrage par rôle, refus = absence.
 */
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/registry", () => ({ registry: { has: () => true }, rolePermissions: {} }));
vi.mock("@/lib/auth", () => ({ getUserDepartmentScope: () => ({ scoped: false }) }));

const { MCP_TOOLS, toolsFor, renderResult, runTool, NO_DATA, toolName, toolInput } = await import("../_tools");

const names = (role: string, predicates: string[] = []) => toolsFor(viewerFor(role, { predicates }), () => true).map((t) => t.key);

describe("outils MCP — lot 1", () => {
  it("liste blanche : jamais la trésorerie ni le suivi pastoral", () => {
    const keys = Object.keys(MCP_TOOLS);
    expect(keys.some((k) => k.startsWith("treasury."))).toBe(false);
    expect(keys.some((k) => k.startsWith("care."))).toBe(false);
    expect(names("SUPER_ADMIN", ["linkedStar", "secretariatTeam", "mediaTeam"]).some((k) => k.startsWith("treasury."))).toBe(false);
  });

  it("STAR : ses outils personnels et l'audio, pas la compta ni les comptes rendus", () => {
    const star = names("STAR", ["linkedStar"]);
    expect(star).toContain("planning.myNextService");
    expect(star).toContain("audio.recentSermons");
    expect(star).not.toContain("accounting.toValidate");
    expect(star).not.toContain("reports.recent");
    expect(star).not.toContain("planning.toReplace");
  });

  it("Resp. département : planning de ses départements ; pas la file de la compta", () => {
    const rd = names("DEPARTMENT_HEAD", ["linkedStar"]);
    expect(rd).toContain("planning.toReplace");
    expect(rd).toContain("accounting.myRequests");
    expect(rd).not.toContain("accounting.toValidate");
  });

  it("Secrétaire : comptes rendus ; Comptable : file de la compta, pas de planning", () => {
    expect(names("SECRETARY")).toContain("reports.recent");
    const acc = names("ACCOUNTANT");
    expect(acc).toContain("accounting.toValidate");
    expect(acc).not.toContain("planning.toReplace");
    expect(acc).not.toContain("reports.recent");
  });

  it("nom d'outil MCP stable", () => {
    expect(toolName("planning.myNextService")).toBe("planning_myNextService");
  });

  it("un refus et une question inexistante répondent comme une absence de donnée", async () => {
    expect(renderResult({ refused: true }).text).toBe(NO_DATA);
    expect(renderResult(null).text).toBe(NO_DATA);
    const ctx = { session: {} as never, churchId: "c1", viewer: viewerFor("STAR") };
    expect(await runTool("treasury.balances", {}, ctx)).toBeNull();
    expect(await runTool("accounting.toValidate", {}, ctx)).toBeNull();
  });

  it("rendu : lignes nettoyées, lien absolu, pas de reste ni de pagination quand tout tient", () => {
    process.env.APP_URL = "https://koinonia.test";
    const items = Array.from({ length: 9 }, (_, i) => ({ label: `l${i}`, ...(i === 0 ? { detail: "b" } : {}) }));
    const out = renderResult({ title: "T", items, total: 9, href: "/planning", hrefLabel: "P" });
    expect(out.text).toContain("- l0 — b");
    expect(out.text).toContain("- l1\n");
    expect(out.text).not.toMatch(/de plus|Lignes|offset/);
    expect(out.text).toContain("https://koinonia.test/planning");
    expect(out.structured).toMatchObject({ total: 9, offset: 0, nextOffset: null, link: "https://koinonia.test/planning" });
  });

  it("pagination : 50 lignes par défaut, total toujours donné, suite par offset", () => {
    const answer = { title: "T", items: Array.from({ length: 120 }, (_, i) => ({ label: `l${i}` })), total: 120, href: "/x", hrefLabel: "X" };
    const first = renderResult(answer);
    expect((first.structured.items as unknown[]).length).toBe(50);
    expect(first.structured).toMatchObject({ total: 120, offset: 0, nextOffset: 50 });
    expect(first.text).toContain("Lignes 1 à 50 sur 120 ; suite avec offset=50.");
    const last = renderResult(answer, { offset: 100, limit: 100 });
    expect((last.structured.items as unknown[]).length).toBe(20);
    expect(last.structured).toMatchObject({ offset: 100, nextOffset: null });
    expect(last.text).toContain("Lignes 101 à 120 sur 120.");
    expect(renderResult(answer, { offset: 500 }).text).toContain("Plus de ligne après la 120e");
  });

  it("lien direct par ligne quand la question en donne un, en texte et en données", () => {
    const out = renderResult({ title: "T", items: [{ label: "dim. 25 oct. · Culte", href: "/admin/events/e25/report" }, { label: "sans lien" }], total: 2, href: "/admin/reports", hrefLabel: "R" });
    expect(out.text).toContain("- dim. 25 oct. · Culte : https://koinonia.test/admin/events/e25/report");
    expect(out.text).toContain("- sans lien\n");
    expect(out.structured.items).toEqual([
      { label: "dim. 25 oct. · Culte", detail: null, link: "https://koinonia.test/admin/events/e25/report" },
      { label: "sans lien", detail: null, link: null },
    ]);
  });

  it("schéma d'entrée : limit borné à 100, offset positif", () => {
    expect(toolInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(toolInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(toolInput.safeParse({ offset: -1 }).success).toBe(false);
    expect(toolInput.safeParse({ limit: 100, offset: 50, day: "2026-10-25" }).success).toBe(true);
  });

  it("reports_get : proposé avec les comptes rendus, jamais au STAR ni au Comptable", () => {
    expect(names("SECRETARY")).toContain("reports.get");
    expect(names("REPORTER")).toContain("reports.get");
    expect(names("STAR")).not.toContain("reports.get");
    expect(names("ACCOUNTANT")).not.toContain("reports.get");
  });
});
