/**
 * Tests — outils MCP (spec 081) : liste blanche, filtrage par rôle, refus = absence.
 */
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/registry", () => ({ registry: { has: () => true }, rolePermissions: {} }));
vi.mock("@/lib/auth", () => ({ getUserDepartmentScope: () => ({ scoped: false }) }));

const { MCP_TOOLS, toolsFor, renderResult, runTool, NO_DATA, toolName } = await import("../_tools");

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

  it("rendu : lignes, reste et lien absolu vers l'écran", () => {
    process.env.APP_URL = "https://koinonia.test";
    const out = renderResult({ title: "T", items: [{ label: "a", detail: "b" }], total: 3, href: "/planning", hrefLabel: "P" });
    expect(out.text).toContain("- a — b");
    expect(out.text).toContain("(2 de plus dans Koinonia)");
    expect(out.text).toContain("https://koinonia.test/planning");
    expect(out.structured).toMatchObject({ total: 3, link: "https://koinonia.test/planning" });
  });
});
