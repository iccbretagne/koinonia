import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/client";
import {
  canEditSettings,
  canManageApplications,
  canViewApplication,
  canDecideAssignment,
  isOwnApplication,
  type ServingUser,
} from "../access";

const CHURCH = "church-1";
const PVS = "dept-pvs";
const ACCUEIL = { id: "dept-accueil", ministryId: "min-relation" };
const LOUANGE = { id: "dept-louange", ministryId: "min-louange" };

const perms = {
  SUPER_ADMIN: ["serving:manage"],
  ADMIN: ["serving:manage"],
  SECRETARY: [],
  MINISTER: [],
  DEPARTMENT_HEAD: [],
  STAR: [],
};

function user(role: Role, opts: { departments?: string[]; ministryId?: string | null; isSuperAdmin?: boolean } = {}): ServingUser {
  return {
    isSuperAdmin: opts.isSuperAdmin ?? false,
    churchRoles: [
      {
        churchId: CHURCH,
        role,
        ministryId: opts.ministryId ?? null,
        departments: (opts.departments ?? []).map((id) => ({ department: { id } })),
      },
    ],
  };
}

describe("canManageApplications", () => {
  it("Admin oui, Secrétaire non", () => {
    expect(canManageApplications(user("ADMIN"), CHURCH, [PVS], perms)).toBe(true);
    expect(canManageApplications(user("SECRETARY"), CHURCH, [PVS], perms)).toBe(false);
  });
  it("membre PVS lié (rôle STAR) et responsable PVS oui", () => {
    expect(canManageApplications(user("STAR", { departments: [PVS] }), CHURCH, [PVS], perms)).toBe(true);
    expect(canManageApplications(user("DEPARTMENT_HEAD", { departments: [PVS] }), CHURCH, [PVS], perms)).toBe(true);
  });
  it("responsable d'un autre département non, ni dans une autre église", () => {
    expect(canManageApplications(user("DEPARTMENT_HEAD", { departments: [ACCUEIL.id] }), CHURCH, [PVS], perms)).toBe(false);
    expect(canManageApplications(user("ADMIN"), "autre-eglise", [PVS], perms)).toBe(false);
  });
  it("sans département PVS, seuls Admin et Super Admin gèrent", () => {
    expect(canManageApplications(user("STAR", { departments: [PVS] }), CHURCH, [], perms)).toBe(false);
    expect(canManageApplications(user("STAR", { isSuperAdmin: true }), CHURCH, [], perms)).toBe(true);
  });
});

describe("canViewApplication", () => {
  const head = user("DEPARTMENT_HEAD", { departments: [ACCUEIL.id] });
  const minister = user("MINISTER", { ministryId: ACCUEIL.ministryId });
  it("le département affecté voit la fiche (en attente, observation, confirmé)", () => {
    for (const status of ["PENDING", "OBSERVATION", "CONFIRMED"] as const) {
      expect(canViewApplication(head, CHURCH, false, [{ status, department: ACCUEIL }])).toBe(true);
      expect(canViewApplication(minister, CHURCH, false, [{ status, department: ACCUEIL }])).toBe(true);
    }
  });
  it("plus après un renvoi", () => {
    expect(canViewApplication(head, CHURCH, false, [{ status: "SENT_BACK", department: ACCUEIL }])).toBe(false);
  });
  it("responsable ou Ministre d'un autre département non", () => {
    expect(canViewApplication(head, CHURCH, false, [{ status: "OBSERVATION", department: LOUANGE }])).toBe(false);
    expect(canViewApplication(minister, CHURCH, false, [{ status: "OBSERVATION", department: LOUANGE }])).toBe(false);
  });
  it("un STAR du département affecté (non responsable) non", () => {
    const star = user("STAR", { departments: [ACCUEIL.id] });
    expect(canViewApplication(star, CHURCH, false, [{ status: "OBSERVATION", department: ACCUEIL }])).toBe(false);
    expect(canDecideAssignment(star, CHURCH, ACCUEIL)).toBe(false);
  });
});

describe("canEditSettings", () => {
  it("responsable PVS oui, membre PVS non", () => {
    expect(canEditSettings(user("DEPARTMENT_HEAD", { departments: [PVS] }), CHURCH, [PVS], perms)).toBe(true);
    expect(canEditSettings(user("STAR", { departments: [PVS] }), CHURCH, [PVS], perms)).toBe(false);
  });
  it("Admin oui, Secrétaire non", () => {
    expect(canEditSettings(user("ADMIN"), CHURCH, [PVS], perms)).toBe(true);
    expect(canEditSettings(user("SECRETARY"), CHURCH, [PVS], perms)).toBe(false);
  });
});

describe("isOwnApplication", () => {
  it("compte lié à la fiche STAR et accueilli : oui", () => {
    expect(isOwnApplication(["m1"], { memberId: "m1", assignments: [{ status: "OBSERVATION" }] })).toBe(true);
    expect(isOwnApplication(["m1"], { memberId: "m1", assignments: [{ status: "CONFIRMED" }] })).toBe(true);
  });
  it("pas encore accueilli, renvoyé partout ou compte non lié : non", () => {
    expect(isOwnApplication(["m1"], { memberId: "m1", assignments: [{ status: "PENDING" }] })).toBe(false);
    expect(isOwnApplication(["m1"], { memberId: "m1", assignments: [{ status: "SENT_BACK" }] })).toBe(false);
    expect(isOwnApplication(["m2"], { memberId: "m1", assignments: [{ status: "CONFIRMED" }] })).toBe(false);
    expect(isOwnApplication(["m1"], { memberId: null, assignments: [{ status: "CONFIRMED" }] })).toBe(false);
  });
});
