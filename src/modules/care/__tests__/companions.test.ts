import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { logAudit } = await import("@/lib/audit");
const {
  isCompanionEligible,
  listCompanionCandidates,
  listEligibleCompanions,
  isEligibleCompanion,
  getCompanionSettings,
  setCompanionState,
} = await import("../services/companions");

const churchId = "church-1";

function mockCandidateQueries(params: {
  links?: { userId: string; name: string | null; email: string | null; deptIds: string[] }[];
  deptHeadUserIds?: string[];
  exceptions?: { userId: string; mode: "ADDED" | "EXCLUDED" }[];
  msdpDeptIds?: string[];
}) {
  const { links = [], deptHeadUserIds = [], exceptions = [], msdpDeptIds = ["dept-msdp"] } = params;
  prismaMock.department.findMany.mockResolvedValue(msdpDeptIds.map((id) => ({ id })) as never);
  prismaMock.memberUserLink.findMany.mockResolvedValue(
    links.map((l) => ({
      user: { id: l.userId, name: l.name, email: l.email },
      member: { departments: l.deptIds.map((id) => ({ department: { id, name: id } })) },
    })) as never
  );
  prismaMock.userChurchRole.findMany.mockResolvedValue(
    deptHeadUserIds.map((userId) => ({ userId })) as never
  );
  prismaMock.careCompanion.findMany.mockResolvedValue(exceptions as never);
}

describe("isCompanionEligible", () => {
  it("MSDP sans exception : accompagnant possible", () => {
    expect(isCompanionEligible({ isMsdp: true, exception: null })).toBe(true);
  });

  it("MSDP exclu : pas accompagnant possible", () => {
    expect(isCompanionEligible({ isMsdp: true, exception: "EXCLUDED" })).toBe(false);
  });

  it("hors MSDP sans exception : pas accompagnant possible", () => {
    expect(isCompanionEligible({ isMsdp: false, exception: null })).toBe(false);
  });

  it("hors MSDP ajouté : accompagnant possible", () => {
    expect(isCompanionEligible({ isMsdp: false, exception: "ADDED" })).toBe(true);
  });

  it("MSDP ajouté nominativement (déjà membre) : reste accompagnant possible", () => {
    expect(isCompanionEligible({ isMsdp: true, exception: "ADDED" })).toBe(true);
  });
});

describe("listCompanionCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("membre d'un département MSDP par la fiche STAR : isMsdp = true", async () => {
    mockCandidateQueries({
      links: [{ userId: "u1", name: "Alice", email: "alice@example.org", deptIds: ["dept-msdp"] }],
    });

    const [candidate] = await listCompanionCandidates(churchId);
    expect(candidate.isMsdp).toBe(true);
    expect(candidate.exception).toBeNull();
  });

  it("responsable d'un département MSDP sans y appartenir par la fiche : isMsdp = true", async () => {
    mockCandidateQueries({
      links: [{ userId: "u2", name: "Bob", email: "bob@example.org", deptIds: ["dept-autre"] }],
      deptHeadUserIds: ["u2"],
    });

    const [candidate] = await listCompanionCandidates(churchId);
    expect(candidate.isMsdp).toBe(true);
  });

  it("ni appartenance ni responsabilité MSDP : isMsdp = false", async () => {
    mockCandidateQueries({
      links: [{ userId: "u3", name: "Chloé", email: "chloe@example.org", deptIds: ["dept-autre"] }],
    });

    const [candidate] = await listCompanionCandidates(churchId);
    expect(candidate.isMsdp).toBe(false);
  });

  it("reprend l'exception déclarée pour l'utilisateur", async () => {
    mockCandidateQueries({
      links: [{ userId: "u4", name: "Denis", email: null, deptIds: ["dept-msdp"] }],
      exceptions: [{ userId: "u4", mode: "EXCLUDED" }],
    });

    const [candidate] = await listCompanionCandidates(churchId);
    expect(candidate.exception).toBe("EXCLUDED");
  });
});

describe("listEligibleCompanions / isEligibleCompanion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("donnent le même verdict pour un même utilisateur (garde anti-dérive #616)", async () => {
    mockCandidateQueries({
      links: [
        { userId: "u1", name: "Alice", email: "alice@example.org", deptIds: ["dept-msdp"] },
        { userId: "u2", name: "Bob", email: "bob@example.org", deptIds: ["dept-autre"] },
      ],
    });

    const eligible = await listEligibleCompanions(churchId);
    expect(eligible.map((c) => c.id)).toEqual(["u1"]);
    await expect(isEligibleCompanion(churchId, "u1")).resolves.toBe(true);
    await expect(isEligibleCompanion(churchId, "u2")).resolves.toBe(false);
    await expect(isEligibleCompanion(churchId, "inconnu")).resolves.toBe(false);
  });
});

describe("getCompanionSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("répartit en trois groupes et calcule les demandes en cours", async () => {
    mockCandidateQueries({
      links: [
        { userId: "u1", name: "Alice", email: "a@e.org", deptIds: ["dept-msdp"] },
        { userId: "u2", name: "Bob", email: "b@e.org", deptIds: ["dept-autre"] },
        { userId: "u3", name: "Chloé", email: "c@e.org", deptIds: ["dept-autre"] },
      ],
      exceptions: [{ userId: "u2", mode: "ADDED" }],
    });
    prismaMock.appointmentRequest.groupBy.mockResolvedValue([
      { assignedMemberId: "u1", _count: { _all: 2 } },
    ] as never);
    prismaMock.msdpFollowUp.groupBy.mockResolvedValue([
      { assignedConseillerMsdpId: "u2", _count: { _all: 1 } },
    ] as never);

    const settings = await getCompanionSettings(churchId);

    expect(settings.msdp.map((c) => c.id)).toEqual(["u1"]);
    expect(settings.msdp[0].activeAssignments).toBe(2);
    expect(settings.added.map((c) => c.id)).toEqual(["u2"]);
    expect(settings.added[0].activeAssignments).toBe(1);
    expect(settings.candidates.map((c) => c.id)).toEqual(["u3"]);
    expect(settings.candidates[0].activeAssignments).toBe(0);
  });
});

describe("setCompanionState", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse ADDED pour quelqu'un sans compte lié et validé", async () => {
    mockCandidateQueries({ links: [] });

    await expect(
      setCompanionState({ churchId, userId: "u-x", state: "ADDED", actorId: "actor-1" })
    ).rejects.toThrow("compte STAR lié et validé");
    expect(prismaMock.careCompanion.upsert).not.toHaveBeenCalled();
  });

  it("refuse ADDED pour un membre déjà MSDP", async () => {
    mockCandidateQueries({ links: [{ userId: "u1", name: "Alice", email: null, deptIds: ["dept-msdp"] }] });

    await expect(
      setCompanionState({ churchId, userId: "u1", state: "ADDED", actorId: "actor-1" })
    ).rejects.toThrow("appartient déjà au MSDP");
  });

  it("refuse EXCLUDED pour quelqu'un hors MSDP", async () => {
    mockCandidateQueries({ links: [{ userId: "u2", name: "Bob", email: null, deptIds: ["dept-autre"] }] });

    await expect(
      setCompanionState({ churchId, userId: "u2", state: "EXCLUDED", actorId: "actor-1" })
    ).rejects.toThrow("Seul un membre du MSDP");
  });

  it("ADDED : upsert, audit et activeAssignments renvoyés", async () => {
    mockCandidateQueries({ links: [{ userId: "u2", name: "Bob", email: null, deptIds: ["dept-autre"] }] });
    prismaMock.appointmentRequest.groupBy.mockResolvedValue([] as never);
    prismaMock.msdpFollowUp.groupBy.mockResolvedValue([] as never);

    const result = await setCompanionState({ churchId, userId: "u2", state: "ADDED", actorId: "actor-1" });

    expect(prismaMock.careCompanion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId_userId: { churchId, userId: "u2" } },
        create: { churchId, userId: "u2", mode: "ADDED", createdById: "actor-1" },
        update: { mode: "ADDED", createdById: "actor-1" },
      })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "CareCompanion",
        entityId: "u2",
        details: { from: null, to: "ADDED" },
      })
    );
    expect(result).toEqual({ userId: "u2", state: "ADDED", activeAssignments: 0 });
  });

  it("DEFAULT : supprime l'exception existante", async () => {
    mockCandidateQueries({
      links: [{ userId: "u1", name: "Alice", email: null, deptIds: ["dept-msdp"] }],
      exceptions: [{ userId: "u1", mode: "EXCLUDED" }],
    });
    prismaMock.appointmentRequest.groupBy.mockResolvedValue([] as never);
    prismaMock.msdpFollowUp.groupBy.mockResolvedValue([] as never);

    await setCompanionState({ churchId, userId: "u1", state: "DEFAULT", actorId: "actor-1" });

    expect(prismaMock.careCompanion.deleteMany).toHaveBeenCalledWith({ where: { churchId, userId: "u1" } });
  });

  it("DEFAULT idempotent : rien à faire, aucun audit", async () => {
    mockCandidateQueries({ links: [{ userId: "u1", name: "Alice", email: null, deptIds: ["dept-msdp"] }] });
    prismaMock.appointmentRequest.groupBy.mockResolvedValue([] as never);
    prismaMock.msdpFollowUp.groupBy.mockResolvedValue([] as never);

    await setCompanionState({ churchId, userId: "u1", state: "DEFAULT", actorId: "actor-1" });

    expect(prismaMock.careCompanion.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
