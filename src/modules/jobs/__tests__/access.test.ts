import { describe, it, expect } from "vitest";
import { canManageJobs, jobsAccess, requireJobsAuthorOrModerator, patchDate } from "../services/access";

const session = (id: string, roles: string[], isSuperAdmin = false) => ({
  user: { id, isSuperAdmin, churchRoles: roles.map((role) => ({ role })) },
});

describe("droits du module emploi", () => {
  it("canManageJobs : Super Admin, ou rôle qui détient jobs:manage (Admin, Secrétaire)", async () => {
    expect(await canManageJobs(session("u", [], true))).toBe(true);
    expect(await canManageJobs(session("u", ["SECRETARY"]))).toBe(true);
    expect(await canManageJobs(session("u", ["ADMIN"]))).toBe(true);
    expect(await canManageJobs(session("u", ["STAR", "MINISTER"]))).toBe(false);
    expect(await canManageJobs({ user: { id: "u", isSuperAdmin: false } })).toBe(false);
  });

  it("jobsAccess distingue l'auteur et le modérateur", async () => {
    expect(await jobsAccess(session("a", ["STAR"]), "a")).toEqual({ isAuthor: true, canManage: false });
    expect(await jobsAccess(session("b", ["ADMIN"]), "a")).toEqual({ isAuthor: false, canManage: true });
  });

  it("requireJobsAuthorOrModerator refuse un tiers (403)", async () => {
    await expect(requireJobsAuthorOrModerator(session("b", ["STAR"]), "a")).rejects.toMatchObject({ statusCode: 403 });
    expect((await requireJobsAuthorOrModerator(session("a", ["STAR"]), "a")).isAuthor).toBe(true);
  });

  it("patchDate : absent → rien, vide/null → effacé, ISO → Date", () => {
    expect(patchDate("deadline", undefined)).toEqual({});
    expect(patchDate("deadline", null)).toEqual({ deadline: null });
    expect(patchDate("deadline", "")).toEqual({ deadline: null });
    expect(patchDate("deadline", "2026-10-08T00:00:00.000Z")).toEqual({ deadline: new Date("2026-10-08T00:00:00.000Z") });
  });
});
