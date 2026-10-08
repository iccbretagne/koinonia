import { describe, it, expect } from "vitest";
import { canManageJobs, jobsAccess, requireJobsAuthorOrModerator, patchDate } from "../services/access";

const session = (id: string, roles: string[], isSuperAdmin = false) => ({
  user: { id, isSuperAdmin, churchRoles: roles.map((role) => ({ role })) },
});

describe("droits du module emploi", () => {
  it("canManageJobs : Super Admin, Admin ou Secrétaire uniquement", () => {
    expect(canManageJobs(session("u", [], true))).toBe(true);
    expect(canManageJobs(session("u", ["SECRETARY"]))).toBe(true);
    expect(canManageJobs(session("u", ["ADMIN"]))).toBe(true);
    expect(canManageJobs(session("u", ["STAR", "MINISTER"]))).toBe(false);
    expect(canManageJobs({ user: { id: "u", isSuperAdmin: false } })).toBe(false);
  });

  it("jobsAccess distingue l'auteur et le modérateur", () => {
    expect(jobsAccess(session("a", ["STAR"]), "a")).toEqual({ isAuthor: true, canManage: false });
    expect(jobsAccess(session("b", ["ADMIN"]), "a")).toEqual({ isAuthor: false, canManage: true });
  });

  it("requireJobsAuthorOrModerator refuse un tiers (403)", () => {
    expect(() => requireJobsAuthorOrModerator(session("b", ["STAR"]), "a")).toThrow(
      expect.objectContaining({ statusCode: 403 })
    );
    expect(requireJobsAuthorOrModerator(session("a", ["STAR"]), "a").isAuthor).toBe(true);
  });

  it("patchDate : absent → rien, vide/null → effacé, ISO → Date", () => {
    expect(patchDate("deadline", undefined)).toEqual({});
    expect(patchDate("deadline", null)).toEqual({ deadline: null });
    expect(patchDate("deadline", "")).toEqual({ deadline: null });
    expect(patchDate("deadline", "2026-10-08T00:00:00.000Z")).toEqual({ deadline: new Date("2026-10-08T00:00:00.000Z") });
  });
});
