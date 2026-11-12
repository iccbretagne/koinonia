import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { assignEventTasks, listEventTasks, findNotServing } = await import("../task-assignment.service");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed1" } as never);
  prismaMock.task.findUnique.mockImplementation((async (args: { where: { id: string } }) => ({ id: args.where.id, departmentId: "d1", assignments: [] })) as never);
  prismaMock.planning.findMany.mockResolvedValue([{ memberId: "m1" }, { memberId: "m2" }] as never);
  prismaMock.$transaction.mockResolvedValue([] as never);
});

describe("tâches du département pour un événement", () => {
  it("département non lié ⇒ 404", async () => {
    prismaMock.eventDepartment.findUnique.mockResolvedValue(null);
    await expect(listEventTasks("e1", "d1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it("STAR pas en service repérés", async () => {
    expect(await findNotServing("ed1", ["m1", "m3"])).toEqual(["m3"]);
    expect(await findNotServing("ed1", [])).toEqual([]);
  });

  it("affectation : remplace celles des tâches citées, en une transaction", async () => {
    const out = await assignEventTasks("e1", "d1", [
      { taskId: "t1", memberIds: ["m1"] },
      { taskId: "t2", memberIds: ["m1", "m2"] },
    ]);
    expect(prismaMock.taskAssignment.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.taskAssignment.deleteMany).toHaveBeenCalledWith({ where: { taskId: "t1", eventId: "e1" } });
    expect(prismaMock.taskAssignment.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(out.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("tâche d'un autre département ⇒ 404 ; STAR pas en service ⇒ 400 ; rien d'écrit", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({ id: "t1", departmentId: "d2" } as never);
    await expect(assignEventTasks("e1", "d1", [{ taskId: "t1", memberIds: [] }])).rejects.toMatchObject({ statusCode: 404 });
    await expect(assignEventTasks("e1", "d1", [{ taskId: "t1", memberIds: ["m3"] }])).rejects.toMatchObject({
      statusCode: 400,
      message: "Ce STAR n'est pas en service pour cet événement",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
