/**
 * Tests — connexions et réglages des assistants IA (spec 081).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const moduleActive = { value: true };
vi.mock("@/lib/registry", () => ({ registry: { has: () => moduleActive.value } }));

const { revokeConnection, listChurchConnections } = await import("../connections");
const { isMcpEnabled, enabledChurchesFor, setMcpChurchEnabled } = await import("../settings");
const { runMcpMaintenance } = await import("../maintenance");

beforeEach(() => {
  vi.clearAllMocks();
  moduleActive.value = true;
  prismaMock.mcpGrant.findUnique.mockResolvedValue({ id: "g1", userId: "owner", churchId: "c1", revokedAt: null });
});

describe("révocation", () => {
  it("par le propriétaire : effet immédiat, journalisé", async () => {
    await revokeConnection("g1", "owner", async () => false);
    expect(prismaMock.mcpToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: "g1" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "McpGrant", details: { owner: "owner", byOwner: true } }));
  });

  it("par l'administrateur de l'église de la connexion", async () => {
    const canManage = vi.fn(async (churchId: string) => churchId === "c1");
    await revokeConnection("g1", "admin", canManage);
    expect(canManage).toHaveBeenCalledWith("c1");
    expect(prismaMock.mcpGrant.updateMany).toHaveBeenCalled();
  });

  it("par quelqu'un d'autre (autre église) ou connexion déjà révoquée : 404, rien n'est touché", async () => {
    await expect(revokeConnection("g1", "intrus", async () => false)).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.mcpGrant.findUnique.mockResolvedValueOnce({ id: "g1", userId: "owner", churchId: "c1", revokedAt: new Date() });
    await expect(revokeConnection("g1", "owner", async () => true)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.mcpToken.deleteMany).not.toHaveBeenCalled();
  });

  it("liste de l'église : connexions non révoquées avec un rafraîchissement encore valable", async () => {
    prismaMock.mcpGrant.findMany.mockResolvedValue([]);
    await listChurchConnections("c1");
    const where = prismaMock.mcpGrant.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ churchId: "c1", revokedAt: null, tokens: { some: { kind: "REFRESH", usedAt: null } } });
  });
});

describe("activation", () => {
  it("coupée par défaut : sans ligne d'instance ni d'église", async () => {
    prismaMock.mcpSettings.findUnique.mockResolvedValue(null);
    prismaMock.mcpChurchSettings.findUnique.mockResolvedValue(null);
    expect(await isMcpEnabled("c1")).toBe(false);
  });

  it("il faut le module, l'instance et l'église", async () => {
    prismaMock.mcpSettings.findUnique.mockResolvedValue({ enabled: true });
    prismaMock.mcpChurchSettings.findUnique.mockResolvedValue({ enabled: true });
    expect(await isMcpEnabled("c1")).toBe(true);
    prismaMock.mcpChurchSettings.findUnique.mockResolvedValue({ enabled: false });
    expect(await isMcpEnabled("c1")).toBe(false);
    moduleActive.value = false;
    prismaMock.mcpChurchSettings.findUnique.mockResolvedValue({ enabled: true });
    expect(await isMcpEnabled("c1")).toBe(false);
  });

  it("églises proposées à l'autorisation : seulement celles qui l'ont activée", async () => {
    prismaMock.mcpSettings.findUnique.mockResolvedValue({ enabled: true });
    prismaMock.mcpChurchSettings.findMany.mockResolvedValue([{ churchId: "c2" }]);
    expect(await enabledChurchesFor([{ id: "c1", name: "A" }, { id: "c2", name: "B" }])).toEqual([{ id: "c2", name: "B" }]);
    prismaMock.mcpSettings.findUnique.mockResolvedValue({ enabled: false });
    expect(await enabledChurchesFor([{ id: "c2", name: "B" }])).toEqual([]);
  });

  it("changer le réglage de l'église est journalisé", async () => {
    await setMcpChurchEnabled("c1", true, "admin");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", entityType: "McpChurchSettings", details: { enabled: true } }));
  });
});

describe("maintenance", () => {
  it("purge les jetons expirés depuis plus d'un jour et le journal de plus de 12 mois", async () => {
    prismaMock.mcpToken.deleteMany.mockResolvedValue({ count: 4 });
    prismaMock.mcpCall.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.mcpClient.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.mcpConfirmation.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-11-11T03:00:00Z");
    expect(await runMcpMaintenance(now)).toEqual({ tokensDeleted: 4, confirmationsDeleted: 3, callsDeleted: 2, clientsDeleted: 1 });
    expect(prismaMock.mcpConfirmation.deleteMany.mock.calls[0][0].where.expiresAt.lt).toEqual(new Date("2026-11-10T03:00:00Z"));
    expect(prismaMock.mcpClient.deleteMany.mock.calls[0][0].where).toMatchObject({ grants: { none: {} } });
    expect(prismaMock.mcpToken.deleteMany.mock.calls[0][0].where.expiresAt.lt).toEqual(new Date("2026-11-10T03:00:00Z"));
  });
});
