import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: vi.fn(async () => createAdminSession()),
  resolveChurchId: vi.fn(async () => "church-1"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const mockRecord = vi.fn();
vi.mock("@/modules/planning", () => ({
  recordPlanningChanges: (...args: unknown[]) => mockRecord(...args),
}));

const { POST } = await import("../route");

describe("POST recopie du planning — changements regroupés (spec 060)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue({ recorded: 0 });
    prismaMock.eventDepartment.findMany
      .mockResolvedValueOnce([
        {
          departmentId: "d1",
          plannings: [
            { memberId: "m1", status: "EN_SERVICE" }, // nouveau sur la cible
            { memberId: "m2", status: "EN_SERVICE" }, // déjà EN_SERVICE sur la cible
            { memberId: "m3", status: "EN_SERVICE" }, // REMPLACANT sur la cible
          ],
        },
      ])
      .mockResolvedValueOnce([{ id: "ed-target", departmentId: "d1" }]);
    prismaMock.planning.findMany.mockResolvedValue([
      { memberId: "m2", status: "EN_SERVICE" },
      { memberId: "m3", status: "REMPLACANT" },
    ] as never);
    prismaMock.planning.upsert.mockResolvedValue({});
  });

  const post = () =>
    POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ targetEventId: "evt-2" }) }), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });

  it("enregistre les STAR ajoutés ou modifiés par la recopie, avec leur statut d'origine", async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const [, churchId, changes, opts] = mockRecord.mock.calls[0];
    expect(churchId).toBe("church-1");
    expect(changes).toEqual([
      { memberId: "m1", eventId: "evt-2", departmentId: "d1", previousStatus: null },
      { memberId: "m3", eventId: "evt-2", departmentId: "d1", previousStatus: "REMPLACANT" },
    ]);
    expect(opts).toEqual({ actorId: createAdminSession().user.id });
  });

  it("un échec d'enregistrement n'annule pas la recopie", async () => {
    mockRecord.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post();

    expect(res.status).toBe(200);
    expect((await res.json()).copied).toBe(3);
    consoleError.mockRestore();
  });
});
