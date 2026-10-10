import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const getPlanningAvailability = vi.fn();
vi.mock("../../availability/grid", () => ({
  getPlanningAvailability: (...a: unknown[]) => getPlanningAvailability(...a),
}));

const { listReplacementCandidates } = await import("../candidates");

const slot = { churchId: "church-1", departmentId: "dept-1", memberId: "paul", event: { id: "evt-1", date: new Date("2026-11-08T10:00:00Z") } };
const member = (id: string, lastName: string, firstName = id) => ({ member: { id, firstName, lastName } });
const av = (state: string, busyElsewhere: string[] = []) => ({ state, busyElsewhere });

describe("listReplacementCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      member("paul", "Martin"),
      member("lea", "Bernard"),
      member("zoe", "Adam"),
      member("max", "Durand"),
      member("eva", "Petit"),
      member("tom", "Roux"),
      member("ana", "Moreau"),
    ] as never);
    prismaMock.planning.findMany.mockResolvedValue([{ memberId: "tom" }] as never);
    getPlanningAvailability.mockResolvedValue({
      members: new Map([
        ["lea", av("AVAILABLE")],
        ["zoe", av("IF_NEEDED")],
        ["max", av("AVAILABLE", ["Accueil"])],
        ["eva", av("UNAVAILABLE")],
        ["ana", av("NO_RESPONSE")],
      ]),
    });
  });

  it("garde les Disponible puis Si besoin, libres ce jour-là, hors STAR désisté et déjà planifiés", async () => {
    const result = await listReplacementCandidates(slot, prismaMock as never);
    expect(result).toEqual([
      { memberId: "lea", firstName: "lea", lastName: "Bernard", state: "AVAILABLE" },
      { memberId: "zoe", firstName: "zoe", lastName: "Adam", state: "IF_NEEDED" },
    ]);
    const asked = getPlanningAvailability.mock.calls[0][3] as string[];
    expect(asked).not.toContain("paul");
    expect(asked).not.toContain("tom");
  });

  it("trie par nom à disponibilité égale", async () => {
    getPlanningAvailability.mockResolvedValue({
      members: new Map([
        ["lea", av("AVAILABLE")],
        ["zoe", av("AVAILABLE")],
      ]),
    });
    const result = await listReplacementCandidates(slot, prismaMock as never);
    expect(result.map((c) => c.memberId)).toEqual(["zoe", "lea"]);
  });

  it("aucun membre restant : liste vide sans calcul de disponibilité", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([member("paul", "Martin")] as never);
    expect(await listReplacementCandidates(slot, prismaMock as never)).toEqual([]);
    expect(getPlanningAvailability).not.toHaveBeenCalled();
  });
});
