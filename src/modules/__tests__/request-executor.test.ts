import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { executeRequest } from "@/modules/planning";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// executeRequest takes a tx (transaction client), use prismaMock directly
const tx = prismaMock as unknown as Parameters<typeof executeRequest>[0];

describe("executeDemandeAcces — privilege escalation prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
  });

  it("rejects SUPER_ADMIN role", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "SUPER_ADMIN",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("non autorisé");
  });

  it("rejects ADMIN role", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "ADMIN",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("non autorisé");
  });

  it("rejects SECRETARY role", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "SECRETARY",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("non autorisé");
  });

  it("allows DISCIPLE_MAKER role", async () => {
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "role-1" });

    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "DISCIPLE_MAKER",
    }, "approver-1");

    expect(result.success).toBe(true);
  });

  it("allows REPORTER role", async () => {
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "role-1" });

    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "REPORTER",
    }, "approver-1");

    expect(result.success).toBe(true);
  });

  it("allows MINISTER role with valid ministryId", async () => {
    prismaMock.ministry.count.mockResolvedValue(1);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "role-1" });

    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "MINISTER",
      ministryId: "ministry-1",
    }, "approver-1");

    expect(result.success).toBe(true);
  });

  it("rejects MINISTER without ministryId", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "MINISTER",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("ministryId requis");
  });

  it("rejects MINISTER with cross-tenant ministryId", async () => {
    prismaMock.ministry.count.mockResolvedValue(0); // 0 = not in this church

    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "MINISTER",
      ministryId: "ministry-other-church",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("hors périmètre");
  });

  it("allows DEPARTMENT_HEAD with valid departmentIds", async () => {
    prismaMock.department.count.mockResolvedValue(1);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "role-1" });

    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "DEPARTMENT_HEAD",
      departmentIds: ["dept-1"],
    }, "approver-1");

    expect(result.success).toBe(true);
  });

  it("rejects DEPARTMENT_HEAD without departmentIds", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "DEPARTMENT_HEAD",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("departmentIds requis");
  });

  it("rejects DEPARTMENT_HEAD with empty departmentIds", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "DEPARTMENT_HEAD",
      departmentIds: [],
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("departmentIds requis");
  });

  it("rejects DEPARTMENT_HEAD with cross-tenant departmentIds", async () => {
    prismaMock.department.count.mockResolvedValue(0); // 0 of 1 valid

    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "DEPARTMENT_HEAD",
      departmentIds: ["dept-other-church"],
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("hors périmètre");
  });

  it("rejects unknown/arbitrary role string", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "DEMANDE_ACCES", {
      targetUserId: "user-1",
      role: "OWNER",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("non autorisé");
  });
});

describe("executeAjoutEvenement — date validation / DoS prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.event.create.mockResolvedValue({ id: "evt-1" });
  });

  it("rejects invalid eventDate", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "AJOUT_EVENEMENT", {
      eventTitle: "Culte",
      eventType: "CULTE",
      eventDate: "not-a-date",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("eventDate invalide");
  });

  it("rejects invalid recurrenceEnd", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "AJOUT_EVENEMENT", {
      eventTitle: "Culte",
      eventType: "CULTE",
      eventDate: "2025-01-05",
      recurrenceRule: "weekly",
      recurrenceEnd: "not-a-date",
    }, "approver-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("recurrenceEnd invalide");
  });

  it("caps recurrence at 104 occurrences (no infinite loop)", async () => {
    prismaMock.event.create.mockResolvedValue({ id: "evt-1" });
    prismaMock.eventDepartment.createMany.mockResolvedValue({ count: 0 });

    // recurrenceEnd far in the future — would create hundreds of events without the cap
    const result = await executeRequest(tx, "req-1", "church-1", "AJOUT_EVENEMENT", {
      eventTitle: "Culte",
      eventType: "CULTE",
      eventDate: "2020-01-05",
      recurrenceRule: "weekly",
      recurrenceEnd: "2100-01-01",
    }, "approver-1");

    // Should succeed but capped, and signal truncation
    expect(result.success).toBe(true);
    expect(result.recurrenceTruncated).toBe(true);
    expect(result.maxOccurrences).toBe(104);
    // Total event.create calls: 1 (parent) + at most 104 (children)
    expect(prismaMock.event.create.mock.calls.length).toBeLessThanOrEqual(105);
  });
});

describe("événements modifiés ou annulés par demande — notifications (spec 059)", () => {
  const oldDate = new Date("2099-03-01T09:00:00Z");
  const newDate = new Date("2099-03-01T10:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.availabilityCollection.findUnique.mockResolvedValue(null);
    prismaMock.eventDepartment.findMany.mockResolvedValue([]);
    prismaMock.event.findUnique.mockResolvedValue({ id: "evt-1", churchId: "church-1", date: oldDate } as never);
    prismaMock.event.findMany.mockResolvedValue([{ id: "evt-1", title: "Culte", date: oldDate }] as never);
    prismaMock.planning.findMany.mockResolvedValue([
      {
        eventDepartment: { eventId: "evt-1", departmentId: "dept-1", department: { name: "Louange", ministryId: "min-1" } },
        member: { userLinks: [{ userId: "u-star" }] },
      },
    ] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
  });

  it("MODIFICATION_EVENEMENT avec nouvelle date : notifications rendues à l'appelant", async () => {
    prismaMock.event.update.mockResolvedValue({ id: "evt-1", date: newDate } as never);
    const result = await executeRequest(tx, "req-1", "church-1", "MODIFICATION_EVENEMENT", {
      eventId: "evt-1",
      changes: { date: newDate.toISOString() },
    }, "approver-1");
    expect(result.success).toBe(true);
    expect(result.notices?.items.map((i) => i.userId)).toEqual(["u-star"]);
  });

  it("MODIFICATION_EVENEMENT sur le titre seul : aucune notification", async () => {
    prismaMock.event.update.mockResolvedValue({ id: "evt-1", date: oldDate } as never);
    const result = await executeRequest(tx, "req-1", "church-1", "MODIFICATION_EVENEMENT", {
      eventId: "evt-1",
      changes: { title: "Culte de louange" },
    }, "approver-1");
    expect(result.success).toBe(true);
    expect(result.notices).toBeUndefined();
    expect(prismaMock.planning.findMany).not.toHaveBeenCalled();
  });

  it("ANNULATION_EVENEMENT : notifications d'annulation rendues à l'appelant", async () => {
    const result = await executeRequest(tx, "req-1", "church-1", "ANNULATION_EVENEMENT", { eventId: "evt-1" }, "approver-1");
    expect(result.success).toBe(true);
    expect(result.notices?.items).toEqual([expect.objectContaining({ userId: "u-star", type: "EVENT_CANCELLED" })]);
  });
});
