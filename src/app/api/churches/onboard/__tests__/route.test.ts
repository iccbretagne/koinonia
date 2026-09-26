// L'onboarding d'une église ne créait pas le ministère système « Système » / département
// système « Sans département » (contrairement au seed de dev et à l'ancienne migration de
// rétro-création) — gap découvert en implémentant le parking système sur le dernier retrait de
// département d'un STAR (member-directory.service.ts). Sans cette entrée, une église onboardée
// depuis l'app échouerait aussi bien sur ce parking que sur la création d'un disciple sans fiche
// STAR (POST /api/discipleships).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSuperAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { POST } = await import("../route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/churches/onboard", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/churches/onboard — crée le ministère système", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createSuperAdminSession());
    prismaMock.church.findUnique.mockResolvedValue(null);
    prismaMock.church.create.mockResolvedValue({ id: "church-new" } as never);
    prismaMock.ministry.create.mockResolvedValue({ id: "sys-min" } as never);
    prismaMock.userChurchRole.upsert.mockResolvedValue({} as never);
  });

  it("crée le ministère système « Système » avec son département « Sans département »", async () => {
    const res = await POST(makeRequest({ name: "Nouvelle église", slug: "nouvelle-eglise" }));

    expect(res.status).toBe(201);
    expect(prismaMock.ministry.create).toHaveBeenCalledWith({
      data: {
        name: "Système",
        churchId: "church-new",
        isSystem: true,
        departments: { create: { name: "Sans département", isSystem: true } },
      },
    });
  });
});
