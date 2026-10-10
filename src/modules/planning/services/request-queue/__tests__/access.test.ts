import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createDepartmentHeadSession,
  createProtocoleMemberSession,
  createStarSession,
  createSuperAdminSession,
} from "@/__mocks__/auth";
import { resolveRequestQueueAccess } from "../access";

describe("resolveRequestQueueAccess", () => {
  beforeEach(() => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-secretariat" }] as never);
  });

  it("interroge les départements de la fonction dans l'église visée", async () => {
    await resolveRequestQueueAccess(createAdminSession(), "church-1", "SECRETARIAT");
    expect(prismaMock.department.findMany).toHaveBeenCalledWith({
      where: { function: "SECRETARIAT", ministry: { churchId: "church-1" } },
      select: { id: true },
    });
  });

  it("Admin (events:manage) : accès et gestion", async () => {
    expect(await resolveRequestQueueAccess(createAdminSession(), "church-1", "SECRETARIAT")).toEqual({
      configured: true,
      allowed: true,
      canManage: true,
    });
  });

  it("Super Admin : accès et gestion", async () => {
    expect((await resolveRequestQueueAccess(createSuperAdminSession(), "church-1", "COMMUNICATION")).canManage).toBe(true);
  });

  it("membre d'un département de la fonction, quel que soit son rôle : accès sans gestion", async () => {
    const session = createProtocoleMemberSession("dept-secretariat");
    expect(await resolveRequestQueueAccess(session, "church-1", "SECRETARIAT")).toEqual({
      configured: true,
      allowed: true,
      canManage: false,
    });
  });

  it("tiers hors de l'équipe : refusé", async () => {
    const head = createDepartmentHeadSession([{ id: "dept-son", name: "Son" }]);
    expect((await resolveRequestQueueAccess(head, "church-1", "SECRETARIAT")).allowed).toBe(false);
    expect((await resolveRequestQueueAccess(createStarSession(), "church-1", "SECRETARIAT")).allowed).toBe(false);
  });

  it("un rôle tenu dans une autre église est ignoré (#490)", async () => {
    const session = createAdminSession("church-2");
    expect((await resolveRequestQueueAccess(session, "church-1", "SECRETARIAT")).allowed).toBe(false);
  });

  it("fonction non configurée : signalée, l'accès reste celui de la gestion des événements", async () => {
    prismaMock.department.findMany.mockResolvedValue([] as never);
    expect(await resolveRequestQueueAccess(createStarSession(), "church-1", "PRODUCTION_MEDIA")).toEqual({
      configured: false,
      allowed: false,
      canManage: false,
    });
    expect((await resolveRequestQueueAccess(createAdminSession(), "church-1", "PRODUCTION_MEDIA")).allowed).toBe(true);
  });
});
