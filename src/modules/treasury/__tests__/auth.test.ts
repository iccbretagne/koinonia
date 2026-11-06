import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@/generated/prisma/client";
import { createSession } from "@/__mocks__/auth";

let session = createSession();
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => session) }));
let enabled = true;
vi.mock("@/lib/registry", async () => {
  const { ModuleRegistry } = await import("@/core/module-registry");
  const { buildRolePermissions } = await import("@/core/permissions");
  const { allManifests } = await import("@/lib/manifests");
  const r = new ModuleRegistry();
  for (const m of allManifests) r.register(m);
  return { rolePermissions: buildRolePermissions(r), registry: { has: () => enabled } };
});

const { isTreasuryVisible, requireTreasuryAccess, requireTreasuryReopen } = await import("../auth");

const as = (role: Role, churchId = "church-1") =>
  createSession({
    churchRoles: [{ id: "r", churchId, role, ministryId: null, church: { id: churchId, name: "É", slug: "e" }, departments: [] }],
  });

describe("trésorerie — accès (spec 076)", () => {
  beforeEach(() => {
    enabled = true;
  });

  it.each(["ADMIN", "ACCOUNTANT"] as Role[])("%s tient la trésorerie de son église", async (role) => {
    session = as(role);
    await expect(requireTreasuryAccess("church-1")).resolves.toMatchObject({ session });
    expect(await isTreasuryVisible(session, "church-1")).toBe(true);
  });

  it.each(["SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "STAR", "REPORTER", "DISCIPLE_MAKER", "PASTORAL_CARE_REFERENT"] as Role[])(
    "%s n'y a aucun accès et ne la voit pas",
    async (role) => {
      session = as(role);
      await expect(requireTreasuryAccess("church-1")).rejects.toThrow("FORBIDDEN");
      expect(await isTreasuryVisible(session, "church-1")).toBe(false);
    }
  );

  it("un Comptable d'une autre église n'accède pas à celle-ci", async () => {
    session = as("ACCOUNTANT", "church-2");
    await expect(requireTreasuryAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("le Super Admin y accède partout", async () => {
    session = createSession({ isSuperAdmin: true, churchRoles: [] });
    await expect(requireTreasuryAccess("church-9")).resolves.toMatchObject({ canReopen: true });
  });

  it("seuls l'Admin et le Super Admin rouvrent un mois clôturé", async () => {
    session = as("ADMIN");
    await expect(requireTreasuryReopen("church-1")).resolves.toBeDefined();
    session = as("ACCOUNTANT");
    await expect(requireTreasuryReopen("church-1")).rejects.toThrow("FORBIDDEN");
    expect((await requireTreasuryAccess("church-1")).canReopen).toBe(false);
  });

  it("module désactivé : l'entrée de navigation disparaît", async () => {
    enabled = false;
    session = as("ACCOUNTANT");
    expect(await isTreasuryVisible(session, "church-1")).toBe(false);
  });
});
