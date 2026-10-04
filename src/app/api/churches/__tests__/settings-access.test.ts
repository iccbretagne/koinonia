import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, fakeHasChurchPermission } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  hasChurchPermission: fakeHasChurchPermission,
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { PUT } = await import("../[churchId]/route");

const params = Promise.resolve({ churchId: "church-1" });
const current = { name: "ICC Rennes", slug: "icc-rennes", supervisorProfileId: "sup-1" };

function put(body: Record<string, unknown>) {
  return PUT(
    new Request("http://localhost/api/churches/church-1", {
      method: "PUT",
      body: JSON.stringify({ name: current.name, slug: current.slug, secretariatEmails: [], accountingEmails: [], ...body }),
      headers: { "Content-Type": "application/json" },
    }),
    { params }
  );
}

describe("PUT /api/churches/[churchId] — Admin de l'église (church:settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.church.findUnique.mockResolvedValue(current as never);
    prismaMock.church.update.mockResolvedValue({ id: "church-1", secretariatEmails: null, accountingEmails: null } as never);
  });

  it("se garde par church:settings dans l'église visée", async () => {
    await put({});
    expect(mockRequireChurchPermission).toHaveBeenCalledWith("church:settings", "church-1");
  });

  it("modifie les emails, la couleur et le responsable pastoral", async () => {
    prismaMock.pastoralProfile.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    const res = await put({
      secretariatEmails: ["secretariat@eglise.fr"],
      primaryColor: "#123456",
      responsibleProfileId: "prof-1",
      supervisorProfileId: "sup-1",
    });
    expect(res.status).toBe(200);
    expect(prismaMock.church.update).toHaveBeenCalled();
  });

  it.each([
    ["le nom", { name: "Autre nom" }],
    ["l'adresse (slug)", { slug: "autre-adresse" }],
    ["le superviseur", { supervisorProfileId: "sup-2" }],
    ["le superviseur (retrait)", { supervisorProfileId: null }],
  ])("refuse de changer %s → 403", async (_label, body) => {
    const res = await put(body);
    expect(res.status).toBe(403);
    expect(prismaMock.church.update).not.toHaveBeenCalled();
  });
});
