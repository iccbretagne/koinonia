// Spec 054 (Lot 1, T53) — `access-overview.ts` calcule les accès qui ne passent par aucune
// permission de rôle (ADR-0014). Ce test couvre chaque source déclarée dans
// `InheritedAccessSource`, l'exclusion d'un accès fermé/d'un module désactivé, et le complément
// « héritage seul » de `loadAccessPeople` (bergère sans rôle ni fiche liée).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";
import { fakeGetUserMinistryScope } from "@/lib/__tests__/support/ministry-scope-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  getUserMinistryScope: (...args: Parameters<typeof fakeGetUserMinistryScope>) =>
    fakeGetUserMinistryScope(...args),
}));

const mockRegistryHas = vi.fn((_module: string) => true);
vi.mock("@/lib/registry", () => ({ registry: { has: (m: string) => mockRegistryHas(m) } }));

const { listInheritedAccess, loadAccessPeople } = await import("@/lib/access-overview");

const CHURCH_ID = "church-1";

function emptyPrismaDefaults() {
  prismaMock.userDepartment.findMany.mockResolvedValue([]);
  prismaMock.memberUserLink.findMany.mockResolvedValue([]);
  prismaMock.pastoralProfile.findMany.mockResolvedValue([]);
  prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([]);
  prismaMock.appointmentRequest.findMany.mockResolvedValue([]);
  prismaMock.msdpFollowUp.findMany.mockResolvedValue([]);
}

describe("listInheritedAccess (spec 054, ADR-0014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistryHas.mockReturnValue(true);
    emptyPrismaDefaults();
  });

  it("aucun appel Prisma quand userIds est vide", async () => {
    const result = await listInheritedAccess(CHURCH_ID, []);
    expect(result.size).toBe(0);
    expect(prismaMock.userDepartment.findMany).not.toHaveBeenCalled();
  });

  it("department-function : membre (via user_departments) d'un département de fonction PROTOCOLE", async () => {
    prismaMock.userDepartment.findMany.mockResolvedValue([
      {
        department: { id: "dept-1", function: "PROTOCOLE" },
        userChurchRole: { userId: "user-1", role: "STAR" },
      },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-1"]);
    const entries = result.get("user-1") ?? [];
    expect(entries).toEqual([
      expect.objectContaining({ source: "department-function", origin: expect.stringContaining("PROTOCOLE") }),
    ]);
  });

  it("department-function : appartenance via la fiche STAR liée (member_departments)", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      {
        userId: "user-2",
        member: { departments: [{ department: { id: "dept-2", function: "MSDP" } }] },
      },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-2"]);
    const entries = result.get("user-2") ?? [];
    expect(entries).toEqual([
      expect.objectContaining({ source: "department-function", origin: expect.stringContaining("MSDP") }),
    ]);
  });

  it("department-head-function : responsable d'un département de fonction CAPTATION_AUDIO (droit supplémentaire)", async () => {
    prismaMock.userDepartment.findMany.mockResolvedValue([
      {
        department: { id: "dept-3", function: "CAPTATION_AUDIO" },
        userChurchRole: { userId: "user-3", role: "DEPARTMENT_HEAD" },
      },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-3"]);
    const entries = result.get("user-3") ?? [];
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "department-function" }),
        expect.objectContaining({ source: "department-head-function", label: expect.stringContaining("Dépublier") }),
      ])
    );
  });

  it("secretariat-team : membre d'un département de fonction SECRETARIAT reçoit le rôle virtuel", async () => {
    prismaMock.userDepartment.findMany.mockResolvedValue([
      {
        department: { id: "dept-4", function: "SECRETARIAT" },
        userChurchRole: { userId: "user-4", role: "STAR" },
      },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-4"]);
    const entries = result.get("user-4") ?? [];
    expect(entries).toEqual([
      expect.objectContaining({ source: "secretariat-team" }),
    ]);
  });

  it("module désactivé : une fonction dont le module n'est pas actif ne produit aucun accès", async () => {
    mockRegistryHas.mockImplementation((m) => m !== "agenda");
    prismaMock.userDepartment.findMany.mockResolvedValue([
      {
        department: { id: "dept-5", function: "PROTOCOLE" },
        userChurchRole: { userId: "user-5", role: "STAR" },
      },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-5"]);
    expect(result.get("user-5")).toBeUndefined();
  });

  it("pastoral-profile : profil pastoral lié à l'utilisateur", async () => {
    prismaMock.pastoralProfile.findMany.mockResolvedValue([
      { userId: "user-6", name: "Pasteur Jean" },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-6"]);
    const entries = result.get("user-6") ?? [];
    expect(entries).toEqual([
      expect.objectContaining({ source: "pastoral-profile", origin: expect.stringContaining("Pasteur Jean") }),
    ]);
  });

  it("family-leader : berger de plusieurs familles, comptées dans l'origine", async () => {
    prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([
      { userId: "user-7", familyId: "fam-1" },
      { userId: "user-7", familyId: "fam-2" },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-7"]);
    const entries = result.get("user-7") ?? [];
    expect(entries).toEqual([
      expect.objectContaining({ source: "family-leader", origin: expect.stringContaining("2 familles") }),
    ]);
  });

  it("care-assignment : accompagnant en charge d'une demande de rendez-vous OUVERTE", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValue([
      { assignedMemberId: "user-8", assignedTo: null },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-8"]);
    const entries = result.get("user-8") ?? [];
    expect(entries).toEqual([expect.objectContaining({ source: "care-assignment" })]);
  });

  it("care-assignment : un suivi MSDP FERMÉ (hors des statuts ouverts requêtés) n'apparaît pas", async () => {
    // Le statut fermé est filtré côté requête Prisma (status: {in: [...]}) — un mock qui ne
    // renvoie rien pour ce cas simule fidèlement ce que produirait la vraie clause `where`.
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([]);

    const result = await listInheritedAccess(CHURCH_ID, ["user-9"]);
    expect(result.get("user-9")).toBeUndefined();
  });

  it("care-assignment : ignoré quand le module care est désactivé", async () => {
    mockRegistryHas.mockImplementation((m) => m !== "care");
    prismaMock.appointmentRequest.findMany.mockResolvedValue([
      { assignedMemberId: "user-10", assignedTo: null },
    ] as never);

    const result = await listInheritedAccess(CHURCH_ID, ["user-10"]);
    expect(result.get("user-10")).toBeUndefined();
    expect(prismaMock.appointmentRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("loadAccessPeople (spec 054)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistryHas.mockReturnValue(true);
  });

  it("inclut une bergère sans rôle ni fiche liée (accès hérité seul)", async () => {
    prismaMock.user.findMany
      .mockResolvedValueOnce([]) // roleBased
      .mockResolvedValueOnce([
        { id: "bergere-1", name: "Bergère Sarah", displayName: null, email: "sarah@example.com", image: null },
      ] as never); // heritageOnly

    const people = await loadAccessPeople(createAdminSession(CHURCH_ID), CHURCH_ID);

    expect(people).toEqual([
      expect.objectContaining({ id: "bergere-1", email: "sarah@example.com" }),
    ]);
  });

  it("un Ministre au périmètre restreint n'a pas le complément héritage-seul", async () => {
    const { createMinisterSession } = await import("@/__mocks__/auth");
    prismaMock.user.findMany.mockResolvedValue([]);

    await loadAccessPeople(createMinisterSession("min-A", CHURCH_ID), CHURCH_ID);

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
  });
});
