import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/registry", () => ({
  rolePermissions: { ADMIN: ["planning:edit", "accounting:submit"], STAR: ["planning:view"] },
}));

const { loadRequestFormData } = await import("../request-form-options");

describe("loadRequestFormData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.event.findMany.mockResolvedValue([
      { id: "e1", title: "Culte", type: "CULTE", date: new Date("2026-11-01T10:00:00.000Z") },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1", name: "Son", ministry: { name: "Technique" } }] as never);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", name: "Jean", displayName: "Jeannot", email: "j@x.fr" },
      { id: "u2", name: null, displayName: null, email: "anon@x.fr" },
    ] as never);
    prismaMock.ministry.findMany.mockResolvedValue([{ id: "m1", name: "Technique" }] as never);
  });

  it("calcule les droits dans l'église et met en forme les listes du formulaire", async () => {
    const data = await loadRequestFormData(createAdminSession("church-1"), "church-1");

    expect(data.canSubmitDemands).toBe(true);
    expect(data.churchPermissions.has("accounting:submit")).toBe(true);
    expect(data.formOptions.events).toEqual([
      { id: "e1", title: "Culte", type: "CULTE", date: "2026-11-01T10:00:00.000Z" },
    ]);
    expect(data.formOptions.departments).toEqual([{ id: "d1", name: "Son", ministryName: "Technique" }]);
    expect(data.formOptions.users).toEqual([
      { id: "u1", label: "Jeannot" },
      { id: "u2", label: "anon@x.fr" },
    ]);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-1", allowAnnouncements: true }) })
    );
  });

  it("ignore les rôles d'une autre église pour les droits", async () => {
    const data = await loadRequestFormData(createAdminSession("church-2"), "church-1");
    expect(data.canSubmitDemands).toBe(false);
  });

  it("un Super Admin peut toujours soumettre des demandes", async () => {
    const data = await loadRequestFormData(createSession({ isSuperAdmin: true, churchRoles: [] }), "church-1");
    expect(data.canSubmitDemands).toBe(true);
  });
});
