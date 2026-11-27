import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireChurchPermission = vi.fn();
const mockRequireSuperAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...a: unknown[]) => mockRequireChurchPermission(...a),
  requireSuperAdmin: () => mockRequireSuperAdmin(),
}));
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
}));

const { PAGE_GATES, enforcePageGate } = await import("../page-gates");

const AUTH_DIR = path.join(process.cwd(), "src/app/(auth)");
const ctx = { churchId: "church-1", pastoralView: false };

describe("PAGE_GATES — même garde que la page", () => {
  for (const [pathname, gate] of Object.entries(PAGE_GATES)) {
    it(`${pathname} : page.tsx appelle ${gate.call}`, () => {
      expect(pathname).toMatch(/^\/[a-z0-9/-]+$/); // adresse exacte, jamais un identifiant
      const file = path.join(AUTH_DIR, pathname, "page.tsx");
      expect(existsSync(file), `${file} existe`).toBe(true);
      expect(readFileSync(file, "utf8")).toContain(gate.call);
    });
  }
});

describe("enforcePageGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(undefined);
    mockRequireSuperAdmin.mockResolvedValue(undefined);
  });

  it("adresse sans garde ou en-tête absent : ne vérifie rien", async () => {
    await expect(enforcePageGate(null, ctx)).resolves.toBeUndefined();
    await expect(enforcePageGate("/accueil", ctx)).resolves.toBeUndefined();
    await expect(enforcePageGate("/admin/users/123", ctx)).resolves.toBeUndefined();
    await expect(enforcePageGate("/constructor", ctx)).resolves.toBeUndefined();
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("garde acceptée : laisse passer", async () => {
    await expect(enforcePageGate("/admin/users", ctx)).resolves.toBeUndefined();
    expect(mockRequireChurchPermission).toHaveBeenCalledWith("users:manage", "church-1");
  });

  it("garde refusée (FORBIDDEN) : forbidden()", async () => {
    mockRequireChurchPermission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(enforcePageGate("/admin/users", ctx)).rejects.toThrow("NEXT_FORBIDDEN");
    mockRequireSuperAdmin.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(enforcePageGate("/plateforme/eglises", ctx)).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("autre erreur : laissée à la page (aucun refus ajouté)", async () => {
    mockRequireChurchPermission.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    await expect(enforcePageGate("/admin/users", ctx)).resolves.toBeUndefined();
  });

  it("sans église courante : la page affiche son message, pas de refus", async () => {
    await expect(enforcePageGate("/admin/users", { churchId: null, pastoralView: false })).resolves.toBeUndefined();
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("/planning/departements en vue pastorale : la page redirige avant sa garde, pas de refus", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(enforcePageGate("/planning/departements", { churchId: "church-1", pastoralView: true })).resolves.toBeUndefined();
    await expect(enforcePageGate("/planning/departements", ctx)).rejects.toThrow("NEXT_FORBIDDEN");
  });
});
