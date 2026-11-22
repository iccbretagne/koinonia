/**
 * Tests — garde des formulaires (spec 085) : rôle, auteur et co-gestionnaire avec accès délégué,
 * intervenant inchangé, 404 pour tout autre compte.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const current = { session: null as unknown };
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => current.session),
  requireCurrentChurchPermission: vi.fn(),
  getCurrentChurchId: vi.fn(),
}));

const { getFormAccess, requireFormManage, getFormsCapability } = await import("../auth");

const session = (role: string, churchId = "c1", id = "u1") =>
  ({ user: { id, isSuperAdmin: false, churchRoles: [{ churchId, role }] } }) as never;
const FORM = { churchId: "c1", status: "PUBLISHED", createdById: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.form.findFirst.mockResolvedValue(FORM);
  prismaMock.formsGrant.findUnique.mockResolvedValue(null);
  prismaMock.formManager.findUnique.mockResolvedValue(null);
  prismaMock.formFacilitator.findUnique.mockResolvedValue(null);
});

describe("getFormAccess", () => {
  it("rôle forms:manage : via role", async () => {
    expect(await getFormAccess(session("SECRETARY", "c1", "u9"), "f1")).toMatchObject({ kind: "manage", via: "role" });
  });

  it("auteur avec accès délégué : via author ; sans accès : rien", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g1" });
    expect(await getFormAccess(session("STAR"), "f1")).toMatchObject({ kind: "manage", via: "author" });
    prismaMock.formsGrant.findUnique.mockResolvedValue(null);
    expect(await getFormAccess(session("STAR"), "f1")).toBeNull();
  });

  it("co-gestionnaire : via comanager avec accès, rien une fois l'accès retiré", async () => {
    prismaMock.formManager.findUnique.mockResolvedValue({ userId: "u2" });
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g1" });
    expect(await getFormAccess(session("STAR", "c1", "u2"), "f1")).toMatchObject({ kind: "manage", via: "comanager" });
    prismaMock.formsGrant.findUnique.mockResolvedValue(null);
    expect(await getFormAccess(session("STAR", "c1", "u2"), "f1")).toBeNull();
  });

  it("compte d'une autre église, même avec un accès : rien ; formulaire inconnu : rien", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g1" });
    expect(await getFormAccess(session("STAR", "c2"), "f1")).toBeNull();
    prismaMock.form.findFirst.mockResolvedValue(null);
    expect(await getFormAccess(session("STAR"), "f1")).toBeNull();
  });

  it("autre compte délégué, ni auteur ni co-gestionnaire : rien", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g1" });
    expect(await getFormAccess(session("STAR", "c1", "u3"), "f1")).toBeNull();
  });

  it("intervenant : inchangé, jamais manage", async () => {
    prismaMock.formFacilitator.findUnique.mockResolvedValue({ allScope: true, scopes: [] });
    expect(await getFormAccess(session("STAR", "c1", "u3"), "f1")).toMatchObject({ kind: "facilitator" });
  });
});

describe("requireFormManage", () => {
  it("renvoie via ; owner refuse le co-gestionnaire (404) et un intervenant", async () => {
    prismaMock.formManager.findUnique.mockResolvedValue({ userId: "u2" });
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g1" });
    current.session = session("STAR", "c1", "u2");
    expect(await requireFormManage("f1")).toMatchObject({ churchId: "c1", via: "comanager" });
    await expect(requireFormManage("f1", { owner: true })).rejects.toMatchObject({ statusCode: 404 });
    current.session = session("STAR", "c1", "u3");
    prismaMock.formManager.findUnique.mockResolvedValue(null);
    prismaMock.formFacilitator.findUnique.mockResolvedValue({ allScope: true, scopes: [] });
    await expect(requireFormManage("f1")).rejects.toMatchObject({ statusCode: 404 });
    current.session = session("ADMIN", "c1", "u9");
    expect(await requireFormManage("f1", { owner: true })).toMatchObject({ via: "role" });
  });
});

describe("getFormsCapability", () => {
  it("all, own ou null", async () => {
    expect(await getFormsCapability(session("ADMIN"), "c1")).toBe("all");
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g1" });
    expect(await getFormsCapability(session("STAR"), "c1")).toBe("own");
    prismaMock.formsGrant.findUnique.mockResolvedValue(null);
    expect(await getFormsCapability(session("STAR"), "c1")).toBeNull();
  });
});
