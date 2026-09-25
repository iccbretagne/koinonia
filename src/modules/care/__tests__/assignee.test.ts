import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { resolveAssignee, assertExclusiveAssignment, isCurrentAssignee } = await import(
  "../services/assignee"
);

describe("resolveAssignee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PROFILE : renvoie le profil de l'église avec son compte lié", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValue({
      id: "profile-1",
      name: "Pasteur Jean",
      email: "jean@example.org",
      userId: "user-1",
    } as never);

    const assignee = await resolveAssignee("church-1", { kind: "PROFILE", id: "profile-1" });

    expect(assignee).toEqual({
      kind: "PROFILE",
      id: "profile-1",
      userId: "user-1",
      name: "Pasteur Jean",
      email: "jean@example.org",
    });
    expect(prismaMock.pastoralProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "profile-1", churchId: "church-1" } })
    );
  });

  it("PROFILE : rejette un profil hors périmètre ou inexistant", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);

    await expect(resolveAssignee("church-1", { kind: "PROFILE", id: "profile-x" })).rejects.toThrow(
      "Profil pastoral invalide ou hors périmètre"
    );
  });

  it("PROFILE : userId null quand le profil n'a pas de compte rattaché", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValue({
      id: "profile-2",
      name: "Berger Paul",
      email: "paul@example.org",
      userId: null,
    } as never);

    const assignee = await resolveAssignee("church-1", { kind: "PROFILE", id: "profile-2" });
    expect(assignee.userId).toBeNull();
  });

  it("PROFILE : à défaut d'adresse sur le profil, reprend celle du compte rattaché", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValue({
      id: "profile-3",
      name: "Pasteur Marc",
      email: null,
      userId: "user-3",
      user: { email: "marc@example.org" },
    } as never);

    const assignee = await resolveAssignee("church-1", { kind: "PROFILE", id: "profile-3" });
    expect(assignee.email).toBe("marc@example.org");
  });

  it("MEMBER : renvoie le membre du MSDP", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-msdp" }] as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue({
      user: { id: "user-2", name: "Alice Martin", email: "alice@example.org" },
    } as never);

    const assignee = await resolveAssignee("church-1", { kind: "MEMBER", id: "user-2" });

    expect(assignee).toEqual({
      kind: "MEMBER",
      id: "user-2",
      userId: "user-2",
      name: "Alice Martin",
      email: "alice@example.org",
    });
  });

  it("MEMBER : rejette un utilisateur qui n'appartient pas à un département MSDP", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-msdp" }] as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);

    await expect(resolveAssignee("church-1", { kind: "MEMBER", id: "user-x" })).rejects.toThrow(
      "Membre MSDP invalide ou hors périmètre"
    );
  });
});

describe("assertExclusiveAssignment", () => {
  it("ne lève rien quand un seul des deux est renseigné", () => {
    expect(() => assertExclusiveAssignment("profile-1", null)).not.toThrow();
    expect(() => assertExclusiveAssignment(null, "user-1")).not.toThrow();
    expect(() => assertExclusiveAssignment(null, null)).not.toThrow();
  });

  it("lève quand les deux sont renseignés", () => {
    expect(() => assertExclusiveAssignment("profile-1", "user-1")).toThrow("État incohérent");
  });
});

describe("isCurrentAssignee", () => {
  it("vrai si l'appelant est le membre affecté", () => {
    expect(
      isCurrentAssignee("user-1", { assignedMemberId: "user-1", assignedProfileUserId: null })
    ).toBe(true);
  });

  it("vrai si l'appelant est le titulaire du profil pastoral affecté", () => {
    expect(
      isCurrentAssignee("user-1", { assignedMemberId: null, assignedProfileUserId: "user-1" })
    ).toBe(true);
  });

  it("faux si ni l'un ni l'autre ne correspond", () => {
    expect(
      isCurrentAssignee("user-1", { assignedMemberId: "user-2", assignedProfileUserId: "user-3" })
    ).toBe(false);
  });

  it("faux si rien n'est affecté", () => {
    expect(
      isCurrentAssignee("user-1", { assignedMemberId: null, assignedProfileUserId: null })
    ).toBe(false);
  });
});
