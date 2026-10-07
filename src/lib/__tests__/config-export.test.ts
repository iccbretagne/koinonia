import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("../prisma", () => ({ prisma: prismaMock }));

const { exportConfig } = await import("../config-export");

const church = {
  id: "c1",
  name: "Rennes",
  slug: "rennes",
  secretariatEmails: null,
  accountingEmails: "compta@x.fr",
  primaryColor: "#5E17EB",
};

const ministries = [
  {
    id: "min1",
    churchId: "c1",
    name: "Louange",
    isSystem: false,
    departments: [
      { id: "d1", name: "Choristes", isSystem: false, function: null },
      { id: "d2", name: "Son", isSystem: true, function: "CAPTATION_AUDIO" },
    ],
  },
];

const memberDepts = [
  { memberId: "m1", departmentId: "d1", isPrimary: false, member: { id: "m1", firstName: "Anne", lastName: "D", email: null, phone: "06" } },
  { memberId: "m1", departmentId: "d2", isPrimary: true, member: { id: "m1", firstName: "Anne", lastName: "D", email: null, phone: "06" } },
  { memberId: "m2", departmentId: "d2", isPrimary: true, member: { id: "m2", firstName: "Luc", lastName: "B", email: "luc@x.fr", phone: null } },
];

describe("exportConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    prismaMock.church.findMany.mockResolvedValue([church]);
    prismaMock.ministry.findMany.mockResolvedValue(ministries);
    prismaMock.memberDepartment.findMany.mockResolvedValue(memberDepts);
  });
  afterEach(() => vi.useRealTimers());

  it("exporte structure, STAR dédoublonnés, liens et rôles", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      { memberId: "m1", churchId: "c1", validatedAt: new Date("2026-01-01T00:00:00Z"), user: { email: "anne@x.fr" } },
      { memberId: "m2", churchId: "c1", validatedAt: null, user: { email: "luc@x.fr" } },
    ]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "MINISTER", ministryId: "min1", user: { email: "anne@x.fr" }, departments: [] },
      { role: "DEPARTMENT_HEAD", ministryId: null, user: { email: "luc@x.fr" }, departments: [{ departmentId: "d2", isDeputy: false }] },
    ]);

    const result = await exportConfig("all", ["structure", "members", "links"], "admin@x.fr", "1.30.0");

    expect(prismaMock.church.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { name: "asc" } });
    expect(prismaMock.department.findMany).not.toHaveBeenCalled();
    expect(result._meta).toEqual({
      appVersion: "1.30.0",
      exportedAt: "2026-03-01T10:00:00.000Z",
      exportedBy: "admin@x.fr",
      schemaVersion: 1,
      scope: "all",
      categories: ["structure", "members", "links"],
    });
    expect(result.churches).toEqual([
      {
        id: "c1",
        name: "Rennes",
        slug: "rennes",
        secretariatEmails: null,
        accountingEmails: "compta@x.fr",
        primaryColor: "#5E17EB",
        ministries: [
          {
            id: "min1",
            name: "Louange",
            isSystem: false,
            departments: [
              { id: "d1", name: "Choristes", isSystem: false, function: null },
              { id: "d2", name: "Son", isSystem: true, function: "CAPTATION_AUDIO" },
            ],
          },
        ],
        members: [
          { id: "m1", firstName: "Anne", lastName: "D", email: null, phone: "06", departmentIds: ["d1", "d2"], isPrimaryDeptId: "d2" },
          { id: "m2", firstName: "Luc", lastName: "B", email: "luc@x.fr", phone: null, departmentIds: ["d2"], isPrimaryDeptId: "d2" },
        ],
        userLinks: [
          { memberId: "m1", userEmail: "anne@x.fr", churchId: "c1", validatedAt: "2026-01-01T00:00:00.000Z" },
          { memberId: "m2", userEmail: "luc@x.fr", churchId: "c1", validatedAt: null },
        ],
        userRoles: [
          { userEmail: "anne@x.fr", role: "MINISTER", ministryId: "min1", departmentIds: [] },
          { userEmail: "luc@x.fr", role: "DEPARTMENT_HEAD", ministryId: null, departmentIds: ["d2"] },
        ],
      },
    ]);
  });

  it("sans la structure, retrouve les départements de l'église pour exporter les STAR", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    const result = await exportConfig(["c1"], ["members"], "admin@x.fr", "1.30.0");

    expect(prismaMock.church.findMany).toHaveBeenCalledWith({ where: { id: { in: ["c1"] } }, orderBy: { name: "asc" } });
    expect(prismaMock.ministry.findMany).not.toHaveBeenCalled();
    expect(prismaMock.memberDepartment.findMany).toHaveBeenCalledWith({
      where: { departmentId: { in: ["d1", "d2"] } },
      include: { member: true },
    });
    expect(result.churches[0].ministries).toEqual([]);
    expect(result.churches[0].members).toHaveLength(2);
    expect(result.churches[0].userLinks).toEqual([]);
    expect(prismaMock.memberUserLink.findMany).not.toHaveBeenCalled();
  });

  it("n'exporte aucun STAR pour une église sans département", async () => {
    prismaMock.department.findMany.mockResolvedValue([]);
    const result = await exportConfig(["c1"], ["members"], "admin@x.fr", "1.30.0");
    expect(prismaMock.memberDepartment.findMany).not.toHaveBeenCalled();
    expect(result.churches[0].members).toEqual([]);
  });

  it("n'exporte que la structure quand seule la structure est demandée", async () => {
    const result = await exportConfig("all", ["structure"], "admin@x.fr", "1.30.0");
    expect(prismaMock.memberDepartment.findMany).not.toHaveBeenCalled();
    expect(result.churches[0].members).toEqual([]);
    expect(result.churches[0].ministries).toHaveLength(1);
  });
});
