/**
 * Tests — tâches du département par l'assistant IA (spec 081, lot 3) : lecture avec
 * planning:department + périmètre, affectation avec planning:edit, STAR pas en service nommé,
 * aperçu sans écriture, empreinte changée ⇒ refus, service partagé avec l'écran.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const auth = {
  hasChurchPermission: vi.fn(async (..._a: unknown[]) => true),
  requireDepartmentAccess: vi.fn(),
  getUserDepartmentScope: vi.fn(() => ({ scoped: true, departmentIds: ["d1"] })),
};
vi.mock("@/lib/auth", () => auth);
const planning = {
  PLANNED_STATUSES: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"],
  listEventTasks: vi.fn(),
  listServingMembers: vi.fn(),
  findNotServing: vi.fn(async (..._a: unknown[]) => [] as string[]),
  assignEventTasks: vi.fn(),
};
vi.mock("@/modules/planning", () => planning);
const mcp = { createConfirmation: vi.fn(async (..._a: unknown[]) => ({ token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") })), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/app/api/events/[eventId]/departments/[deptId]/planning/_core", () => ({ savePlanning: vi.fn() }));
vi.mock("@/app/api/events/[eventId]/duplicate-planning/_core", () => ({ duplicatePlanning: vi.fn() }));
vi.mock("@/app/api/departments/[departmentId]/notices/_core", () => ({ saveNotice: vi.fn() }));

const p = await import("../_actions/planning");
const { CHANGED } = await import("../_actions/common");
const { ApiError } = await import("@/lib/api-utils");

const session = { user: { id: "u1", isSuperAdmin: false, churchRoles: [{ churchId: "c1", role: "DEPARTMENT_HEAD" }] } };
const ctx = { session: session as never, churchId: "c1", viewer: viewerFor("DEPARTMENT_HEAD"), grantId: "g1" };
const EVENT = { id: "e1", churchId: "c1", title: "Culte ", date: new Date("2099-03-15T09:00:00Z"), planningDeadline: null };
const member = (id: string, firstName: string) => ({ id, firstName, lastName: "Martin" });
const TASKS = [
  { id: "t1", name: "Console", description: "Mixage façade", assignments: [{ member: member("m1", "Paul") }] },
  { id: "t2", name: "Micros", description: null, assignments: [] },
];
const SERVING = [
  { memberId: "m1", status: "EN_SERVICE", member: { firstName: "Paul", lastName: "Martin" } },
  { memberId: "m2", status: "EN_SERVICE_DEBRIEF", member: { firstName: "Léa", lastName: "Martin" } },
];
const input = { eventId: "e1", departmentId: "d1", assignments: [{ taskId: "t2", memberIds: ["m2"] }] };

beforeEach(() => {
  vi.clearAllMocks();
  auth.hasChurchPermission.mockResolvedValue(true);
  auth.requireDepartmentAccess.mockImplementation(() => undefined);
  prismaMock.event.findUnique.mockResolvedValue(EVENT);
  prismaMock.department.findUnique.mockResolvedValue({ id: "d1", name: "Son", ministry: { churchId: "c1" } });
  prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed1" });
  planning.listEventTasks.mockResolvedValue(TASKS);
  planning.listServingMembers.mockResolvedValue(SERVING);
  planning.findNotServing.mockResolvedValue([]);
});

describe("planning_tasks", () => {
  it("tâches, STAR affectés et STAR en service, avec leurs identifiants", async () => {
    const out = await p.planningTasks({ eventId: "e1", departmentId: "d1" }, ctx);
    expect(auth.hasChurchPermission).toHaveBeenCalledWith(ctx.session, "planning:department", "c1");
    expect(out.text).toContain("- Console [taskId t1] — Mixage façade : Paul Martin [memberId m1]");
    expect(out.text).toContain("- Micros [taskId t2] : personne");
    expect(out.text).toContain("- Léa Martin [memberId m2] (débrief)");
    expect(out.structured.serving).toEqual([
      { memberId: "m1", name: "Paul Martin", status: "EN_SERVICE" },
      { memberId: "m2", name: "Léa Martin", status: "EN_SERVICE_DEBRIEF" },
    ]);
  });

  it("refus : hors périmètre, sans planning:department, département non lié", async () => {
    auth.requireDepartmentAccess.mockImplementationOnce(() => {
      throw new ApiError(403, "Accès refusé");
    });
    expect((await p.planningTasks({ eventId: "e1", departmentId: "d1" }, ctx)).text).toContain("pas dans votre périmètre");
    auth.hasChurchPermission.mockResolvedValueOnce(false);
    expect((await p.planningTasks({ eventId: "e1", departmentId: "d1" }, ctx)).text).toContain("pas dans votre périmètre");
    prismaMock.eventDepartment.findUnique.mockResolvedValueOnce(null);
    expect((await p.planningTasks({ eventId: "e1", departmentId: "d1" }, ctx)).text).toContain("pas lié à cet événement");
    expect(planning.listEventTasks).not.toHaveBeenCalled();
  });
});

describe("affecter des tâches", () => {
  it("aperçu : avant → après, rien d'enregistré, jeton lié à l'action", async () => {
    const out = await p.previewAssignTasks(input, ctx);
    expect(auth.hasChurchPermission).toHaveBeenCalledWith(ctx.session, "planning:edit", "c1");
    expect(out.text).toContain("- Micros : personne → Léa Martin");
    expect(out.text).toContain("Les autres tâches du département ne changent pas.");
    expect(planning.assignEventTasks).not.toHaveBeenCalled();
    expect(mcp.createConfirmation.mock.calls[0][1]).toBe("assign_tasks");
  });

  it("STAR pas en service : refus qui le nomme", async () => {
    planning.findNotServing.mockResolvedValue(["m9"]);
    prismaMock.member.findMany.mockResolvedValue([member("m9", "Jean")]);
    const out = await p.previewAssignTasks({ ...input, assignments: [{ taskId: "t2", memberIds: ["m2", "m9"] }] }, ctx);
    expect(out.text).toContain("Ce STAR n'est pas en service pour cet événement : Jean Martin [memberId m9]");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("refus : sans planning:edit, tâche d'un autre département, tâche en double, rien à changer", async () => {
    auth.hasChurchPermission.mockResolvedValueOnce(false);
    expect((await p.previewAssignTasks(input, ctx)).text).toContain("pas dans votre périmètre");
    expect((await p.previewAssignTasks({ ...input, assignments: [{ taskId: "tX", memberIds: [] }] }, ctx)).text).toContain("Tâche introuvable dans ce département [taskId tX]");
    expect((await p.previewAssignTasks({ ...input, assignments: [input.assignments[0], input.assignments[0]] }, ctx)).text).toContain("deux fois");
    expect((await p.previewAssignTasks({ ...input, assignments: [{ taskId: "t1", memberIds: ["m1"] }] }, ctx)).text).toContain("rien à changer");
    expect(p.assignTasksInput.safeParse({ ...input, assignments: Array.from({ length: 31 }, (_, i) => ({ taskId: `t${i}`, memberIds: [] })) }).success).toBe(false);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : service partagé avec l'écran, journalisé via mcp", async () => {
    await p.previewAssignTasks(input, ctx);
    mcp.consumeConfirmation.mockResolvedValue(mcp.createConfirmation.mock.calls[0][2]);
    const out = await p.confirmAssignTasks({ confirmation: "kmx_tok" }, ctx);
    expect(planning.assignEventTasks).toHaveBeenCalledWith("e1", "d1", [{ taskId: "t2", memberIds: ["m2"] }]);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TaskAssignment", entityId: "t2", details: expect.objectContaining({ via: "mcp" }) }));
    expect(out.structured).toMatchObject({ done: true, action: "assign_tasks", tasks: 1 });
  });

  it("confirmation : affectations changées entre-temps ⇒ refus ; règle de l'écran ⇒ son message", async () => {
    await p.previewAssignTasks(input, ctx);
    const payload = mcp.createConfirmation.mock.calls[0][2];
    mcp.consumeConfirmation.mockResolvedValue(payload);
    planning.listEventTasks.mockResolvedValueOnce([TASKS[0], { ...TASKS[1], assignments: [{ member: member("m1", "Paul") }] }]);
    expect((await p.confirmAssignTasks({ confirmation: "kmx_tok" }, ctx)).text).toBe(CHANGED);
    planning.assignEventTasks.mockRejectedValueOnce(new ApiError(400, "Ce STAR n'est pas en service pour cet événement"));
    expect((await p.confirmAssignTasks({ confirmation: "kmx_tok" }, ctx)).text).toBe("Ce STAR n'est pas en service pour cet événement");
    expect(logAudit).not.toHaveBeenCalled();
  });
});
