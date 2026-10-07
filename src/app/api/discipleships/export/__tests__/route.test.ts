import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");

function get(query: string) {
  return GET(new Request(`http://localhost/api/discipleships/export${query}`));
}

async function sheets(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return Object.fromEntries(
    wb.worksheets.map((ws) => {
      const rows: unknown[][] = [];
      ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      return [ws.name, rows];
    })
  );
}

function discipleship(discipleId: string, first: string, last: string, dept?: { name: string; ministry: string }) {
  return {
    discipleId,
    disciple: {
      firstName: first,
      lastName: last,
      departments: dept ? [{ department: { name: dept.name, ministry: { name: dept.ministry } } }] : [],
    },
    discipleMaker: { firstName: "Marc", lastName: "FD" },
    firstMaker: { firstName: "Paul", lastName: "Premier" },
  };
}

describe("GET /api/discipleships/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
  });

  it("exige churchId", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
  });

  it("exporte les statistiques et le détail des présences sur la période demandée", async () => {
    prismaMock.event.findMany.mockResolvedValue([
      { id: "e1", title: "Culte 1", date: new Date("2026-03-01T10:00:00Z") },
      { id: "e2", title: "Culte 2", date: new Date("2026-03-08T10:00:00Z") },
    ]);
    prismaMock.discipleship.findMany.mockResolvedValue([
      discipleship("d1", "Anne", "Durand", { name: "Choristes", ministry: "Louange" }),
      discipleship("d2", "Luc", "Bernard"),
    ]);
    prismaMock.discipleshipAttendance.findMany.mockResolvedValue([
      { memberId: "d1", eventId: "e1" },
      { memberId: "d1", eventId: "e2" },
      { memberId: "d2", eventId: "e2" },
    ]);

    const res = await get("?churchId=church-1&from=2026-03-01&to=2026-03-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="discipolat-mars-2026.xlsx"');
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: new Date("2026-03-01"), lte: new Date("2026-03-31") } }),
      })
    );

    const { Statistiques, "Détail présences": detail } = await sheets(res);
    expect(Statistiques[0]).toContain("Taux (%)");
    expect(Statistiques[1]).toEqual(["Durand", "Anne", "Louange", "Choristes", "Marc FD", "Paul Premier", 2, 2, 0, 100]);
    expect(Statistiques[2]).toEqual(["Bernard", "Luc", "", "", "Marc FD", "Paul Premier", 1, 2, 1, 50]);
    expect(detail).toHaveLength(5);
    expect(detail[3]).toEqual(["Luc Bernard", "Marc FD", "Culte 1", "01/03/2026", "Non"]);
  });

  it("sans événement suivi : pas de taux, pas de feuille de détail, aucune lecture des présences", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.discipleship.findMany.mockResolvedValue([discipleship("d1", "Anne", "Durand")]);

    const res = await get("?churchId=church-1");
    const result = await sheets(res);
    expect(prismaMock.discipleshipAttendance.findMany).not.toHaveBeenCalled();
    expect(Object.keys(result)).toEqual(["Statistiques"]);
    expect(result.Statistiques[1]).toEqual(["Durand", "Anne", "", "", "Marc FD", "Paul Premier", 0, 0, 0, ""]);
  });

  it("produit un classeur vide sans relation de discipolat", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.discipleship.findMany.mockResolvedValue([]);
    const result = await sheets(await get("?churchId=church-1"));
    expect(result).toEqual({ Statistiques: [] });
  });
});
