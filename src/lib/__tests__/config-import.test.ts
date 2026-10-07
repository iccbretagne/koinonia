import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import type { ChurchConfig, KoinoniaConfigExport, MergeStrategy } from "../config-backup-types";

vi.mock("../prisma", () => ({ prisma: prismaMock }));

const { previewImport, applyImport } = await import("../config-import");

function church(overrides: Partial<ChurchConfig> = {}): ChurchConfig {
  return {
    id: "c1",
    name: "Rennes",
    slug: "rennes",
    secretariatEmails: null,
    accountingEmails: null,
    primaryColor: "#000000",
    ministries: [],
    members: [],
    userLinks: [],
    userRoles: [],
    ...overrides,
  };
}

function backup(churches: ChurchConfig[], schemaVersion = 1): KoinoniaConfigExport {
  return {
    _meta: { appVersion: "1", exportedAt: "2026-03-01T00:00:00.000Z", exportedBy: "a", schemaVersion: schemaVersion as 1, scope: "all", categories: [] },
    churches,
  };
}

/** Identifiants « déjà présents » dans l'instance cible, par modèle. */
function existing(ids: Partial<Record<"ministry" | "department" | "member", string[]>>) {
  for (const model of ["ministry", "department", "member"] as const) {
    prismaMock[model].findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      (ids[model] ?? []).includes(where.id) ? { id: where.id } : null
    );
  }
}

const result = (r: Partial<{ created: number; updated: number; skipped: number; warnings: string[] }>) => ({
  created: 0, updated: 0, skipped: 0, errors: 0, warnings: [], ...r,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findUnique.mockResolvedValue(null);
  existing({});
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
    where.email.endsWith("@known.fr") ? { id: `u-${where.email}` } : null
  );
  prismaMock.userChurchRole.create.mockResolvedValue({ id: "role-new" });
});

describe("previewImport", () => {
  it("refuse une version de schéma inconnue", async () => {
    await expect(previewImport(backup([], 2))).rejects.toThrow("Version de schéma non supportée : 2");
  });

  it("compte les éléments et signale les églises déjà présentes (par id ou par slug)", async () => {
    prismaMock.church.findMany.mockResolvedValue([{ id: "c1", slug: "rennes" }, { id: "zz", slug: "brest" }]);
    const preview = await previewImport(
      backup([
        church({
          ministries: [{ id: "m1", name: "L", isSystem: false, departments: [{ id: "d1", name: "C", isSystem: false, function: null }] }],
          members: [{ id: "s1", firstName: "a", lastName: "b", email: null, phone: null, departmentIds: [], isPrimaryDeptId: null }],
          userRoles: [{ userEmail: "x", role: "ADMIN", ministryId: null, departmentIds: [] }],
        }),
        church({ id: "c2", slug: "brest" }),
        church({ id: "c3", slug: "nantes" }),
      ])
    );
    expect(preview.churches.map((c) => c.existsInTarget)).toEqual([true, true, false]);
    expect(preview.counts).toEqual({ ministries: 1, departments: 1, members: 1, userLinks: 0, userRoles: 1 });
    expect(preview.exportedAt).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("applyImport — église", () => {
  it("refuse une version de schéma inconnue", async () => {
    await expect(applyImport(backup([], 2), "SKIP", [])).rejects.toThrow("Version de schéma non supportée");
  });

  it("crée une église absente", async () => {
    const r = await applyImport(backup([church()]), "UPDATE", []);
    expect(prismaMock.church.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: "c1", slug: "rennes" }) });
    expect(r).toEqual(result({ created: 1 }));
  });

  it("retrouve une église par slug et poursuit avec son identifiant local", async () => {
    prismaMock.church.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "local-1" });
    const r = await applyImport(
      backup([church({ ministries: [{ id: "m1", name: "L", isSystem: false, departments: [] }] })]),
      "UPDATE",
      ["structure"]
    );
    expect(prismaMock.church.update).toHaveBeenCalledWith({ where: { id: "local-1" }, data: expect.objectContaining({ name: "Rennes" }) });
    expect(prismaMock.ministry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ churchId: "local-1" }) });
    expect(r).toEqual(result({ created: 1, updated: 1 }));
  });

  it("laisse une église existante intacte en SKIP", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ id: "c1" });
    const r = await applyImport(backup([church()]), "SKIP", []);
    expect(prismaMock.church.update).not.toHaveBeenCalled();
    expect(r).toEqual(result({ skipped: 1 }));
  });
});

describe("applyImport — structure", () => {
  const structure = church({
    ministries: [
      {
        id: "m1", name: "Louange", isSystem: false,
        departments: [
          { id: "d1", name: "Choristes", isSystem: false, function: null },
          { id: "d2", name: "Son", isSystem: false, function: "CAPTATION_AUDIO" },
        ],
      },
    ],
  });

  it.each<[MergeStrategy, object]>([
    // église et ministère mis à jour, deux départements créés
    ["UPDATE", { created: 2, updated: 2 }],
    // église et ministère laissés tels quels, deux départements créés
    ["SKIP", { created: 2, skipped: 2 }],
  ])("crée les absents et traite les existants en %s", async (strategy, counts) => {
    prismaMock.church.findUnique.mockResolvedValue({ id: "c1" });
    existing({ ministry: ["m1"] });
    const r = await applyImport(backup([structure]), strategy, ["structure"]);
    expect(prismaMock.department.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.ministry.update).toHaveBeenCalledTimes(strategy === "SKIP" ? 0 : 1);
    expect(r).toEqual(result(counts));
  });

  it("met à jour un département existant avec son ministère", async () => {
    existing({ department: ["d2"] });
    await applyImport(backup([structure]), "UPDATE", ["structure"]);
    expect(prismaMock.department.update).toHaveBeenCalledWith({
      where: { id: "d2" },
      data: { name: "Son", isSystem: false, function: "CAPTATION_AUDIO", ministryId: "m1" },
    });
  });

  it("en REPLACE, supprime ministères et départements absents du fichier, sauf s'ils sont rattachés", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1", name: "Choristes" }, { id: "old", name: "Ancien" }, { id: "busy", name: "Occupé" }]);
    prismaMock.ministry.findMany.mockResolvedValue([{ id: "m1", name: "Louange" }, { id: "mold", name: "Vieux" }, { id: "mbusy", name: "Pris" }]);
    prismaMock.department.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "busy") throw new Error("FK");
      return {};
    });
    prismaMock.ministry.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "mbusy") throw new Error("FK");
      return {};
    });

    const r = await applyImport(backup([structure]), "REPLACE", ["structure"]);

    expect(prismaMock.memberDepartment.deleteMany).toHaveBeenCalledWith({ where: { departmentId: "old" } });
    expect(prismaMock.userDepartment.deleteMany).toHaveBeenCalledWith({ where: { departmentId: "old" } });
    expect(prismaMock.department.delete).toHaveBeenCalledTimes(2);
    expect(prismaMock.ministry.delete).toHaveBeenCalledTimes(2);
    expect(r.warnings).toEqual([
      "Département « Occupé » (busy) ignoré : des données opérationnelles y sont rattachées",
      "Ministère « Pris » (mbusy) ignoré : des données y sont rattachées",
    ]);
    // église + ministère + 2 départements créés ; 2 suppressions réussies ; 2 échecs
    expect(r).toEqual(result({ created: 4, updated: 2, skipped: 2, warnings: r.warnings }));
  });
});

describe("applyImport — STAR", () => {
  const withMembers = church({
    members: [
      { id: "s1", firstName: "Anne", lastName: "D", email: null, phone: null, departmentIds: ["d1", "gone"], isPrimaryDeptId: "d1" },
      { id: "s2", firstName: "Luc", lastName: "B", email: "l@x.fr", phone: "06", departmentIds: ["d1"], isPrimaryDeptId: null },
    ],
  });

  it("crée et met à jour les STAR et leurs départements, en ignorant les départements absents", async () => {
    existing({ member: ["s2"], department: ["d1"] });
    const r = await applyImport(backup([withMembers]), "UPDATE", ["members"]);
    expect(prismaMock.member.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: "s1" }) });
    expect(prismaMock.member.update).toHaveBeenCalledWith({ where: { id: "s2" }, data: expect.objectContaining({ phone: "06" }) });
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledWith({
      where: { memberId_departmentId: { memberId: "s1", departmentId: "d1" } },
      create: { memberId: "s1", departmentId: "d1", isPrimary: true },
      update: { isPrimary: true },
    });
    expect(r).toEqual(result({ created: 2, updated: 1 }));
    expect(prismaMock.memberDepartment.deleteMany).not.toHaveBeenCalled();
  });

  it("en SKIP, ne touche ni un STAR existant ni ses départements", async () => {
    existing({ member: ["s1", "s2"], department: ["d1"] });
    const r = await applyImport(backup([withMembers]), "SKIP", ["members"]);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
    expect(prismaMock.memberDepartment.upsert).not.toHaveBeenCalled();
    expect(r).toEqual(result({ created: 1, skipped: 2 }));
  });

  it("en SKIP, rattache un STAR créé sans modifier un rattachement existant", async () => {
    existing({ department: ["d1"] });
    await applyImport(backup([church({ members: [withMembers.members[1]] })]), "SKIP", ["members"]);
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });

  it("en REPLACE, retire les rattachements des STAR absents du fichier", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1" }]);
    const r = await applyImport(backup([withMembers]), "REPLACE", ["members"]);
    expect(prismaMock.memberDepartment.deleteMany).toHaveBeenCalledWith({
      where: { departmentId: { in: ["d1"] }, memberId: { notIn: ["s1", "s2"] } },
    });
    expect(r.updated).toBe(1);
  });

  it("en REPLACE, ne retire rien pour une église sans département", async () => {
    prismaMock.department.findMany.mockResolvedValue([]);
    await applyImport(backup([withMembers]), "REPLACE", ["members"]);
    expect(prismaMock.memberDepartment.deleteMany).not.toHaveBeenCalled();
  });
});

describe("applyImport — liaisons et rôles", () => {
  const withLinks = church({
    userLinks: [
      { memberId: "s1", userEmail: "anne@known.fr", churchId: "c1", validatedAt: "2026-01-01T00:00:00.000Z" },
      { memberId: "s2", userEmail: "luc@known.fr", churchId: "c1", validatedAt: null },
      { memberId: "s3", userEmail: "ghost@other.fr", churchId: "c1", validatedAt: null },
      { memberId: "missing", userEmail: "zoe@known.fr", churchId: "c1", validatedAt: null },
    ],
    userRoles: [
      { userEmail: "anne@known.fr", role: "MINISTER", ministryId: "m1", departmentIds: [] },
      { userEmail: "luc@known.fr", role: "DEPARTMENT_HEAD", ministryId: null, departmentIds: ["d1", "gone"] },
      { userEmail: "ghost@other.fr", role: "ADMIN", ministryId: null, departmentIds: [] },
    ],
  });

  const warnings = [
    "Liaison membre ignorée : utilisateur « ghost@other.fr » introuvable sur cette instance",
    "Liaison membre ignorée : membre missing introuvable",
    "Rôle ignoré : utilisateur « ghost@other.fr » introuvable sur cette instance",
  ];

  beforeEach(() => existing({ member: ["s1", "s2", "s3"], department: ["d1"] }));

  it("en REPLACE, efface puis recrée liaisons et rôles", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ id: "r-old" }]);
    const r = await applyImport(backup([withLinks]), "REPLACE", ["links"]);
    expect(prismaMock.memberUserLink.deleteMany).toHaveBeenCalledWith({ where: { churchId: "c1" } });
    expect(prismaMock.userDepartment.deleteMany).toHaveBeenCalledWith({ where: { userChurchRoleId: { in: ["r-old"] } } });
    expect(prismaMock.userChurchRole.deleteMany).toHaveBeenCalledWith({ where: { churchId: "c1" } });
    expect(prismaMock.memberUserLink.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.memberUserLink.create).toHaveBeenCalledWith({
      data: { memberId: "s1", userId: "u-anne@known.fr", churchId: "c1", validatedAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    expect(prismaMock.userChurchRole.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userDepartment.create).toHaveBeenCalledWith({ data: { userChurchRoleId: "role-new", departmentId: "d1" } });
    expect(prismaMock.userDepartment.upsert).not.toHaveBeenCalled();
    expect(r).toEqual(result({ created: 5, skipped: 3, warnings }));
  });

  it("en REPLACE sans rôle existant, n'efface aucun département de rôle", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    await applyImport(backup([church()]), "REPLACE", ["links"]);
    expect(prismaMock.userDepartment.deleteMany).not.toHaveBeenCalled();
  });

  it("en UPDATE, met à jour l'existant et crée le reste", async () => {
    prismaMock.memberUserLink.findFirst.mockImplementation(async ({ where }: { where: { memberId: string } }) =>
      where.memberId === "s1" ? { id: "link-1" } : null
    );
    prismaMock.userChurchRole.findUnique.mockImplementation(async ({ where }: { where: { userId_churchId_role: { role: string } } }) =>
      where.userId_churchId_role.role === "MINISTER" ? { id: "role-1" } : null
    );
    const r = await applyImport(backup([withLinks]), "UPDATE", ["links"]);
    expect(prismaMock.memberUserLink.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.memberUserLink.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { validatedAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    expect(prismaMock.memberUserLink.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.userChurchRole.update).toHaveBeenCalledWith({ where: { id: "role-1" }, data: { ministryId: "m1" } });
    expect(prismaMock.userDepartment.upsert).toHaveBeenCalledWith({
      where: { userChurchRoleId_departmentId: { userChurchRoleId: "role-new", departmentId: "d1" } },
      create: { userChurchRoleId: "role-new", departmentId: "d1" },
      update: {},
    });
    expect(r).toEqual(result({ created: 3, updated: 2, skipped: 3, warnings }));
  });

  it("en SKIP, laisse liaisons et rôles existants intacts", async () => {
    prismaMock.memberUserLink.findFirst.mockResolvedValue({ id: "link" });
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ id: "role" });
    const r = await applyImport(backup([withLinks]), "SKIP", ["links"]);
    expect(prismaMock.memberUserLink.update).not.toHaveBeenCalled();
    expect(prismaMock.memberUserLink.create).not.toHaveBeenCalled();
    expect(prismaMock.userChurchRole.update).not.toHaveBeenCalled();
    expect(r).toEqual(result({ created: 1, skipped: 7, warnings }));
  });
});
