import { describe, it, expect } from "vitest";
import { hasPermission, userHasAnyRole } from "../permissions";
import type { Role } from "@/generated/prisma/client";

describe("hasPermission", () => {
  const allPermissions = [
    "planning:view",
    "planning:edit",
    "members:view",
    "members:manage",
    "events:view",
    "events:manage",
    "departments:view",
    "departments:manage",
    "church:manage",
    "users:manage",
  ];

  it("SUPER_ADMIN has all permissions", () => {
    const perms = hasPermission("SUPER_ADMIN");
    for (const p of allPermissions) {
      expect(perms).toContain(p);
    }
  });

  it("ADMIN has all permissions except church:manage and users:manage", () => {
    const perms = hasPermission("ADMIN");
    expect(perms).toContain("planning:view");
    expect(perms).toContain("planning:edit");
    expect(perms).toContain("members:view");
    expect(perms).toContain("members:manage");
    expect(perms).toContain("events:view");
    expect(perms).toContain("events:manage");
    expect(perms).toContain("departments:view");
    expect(perms).toContain("departments:manage");
    expect(perms).not.toContain("church:manage");
    expect(perms).not.toContain("users:manage");
  });

  it("SECRETARY has view + events:manage, no edit/manage for planning/members/departments", () => {
    const perms = hasPermission("SECRETARY");
    expect(perms).toContain("planning:view");
    expect(perms).not.toContain("planning:edit");
    expect(perms).toContain("members:view");
    expect(perms).not.toContain("members:manage");
    expect(perms).toContain("events:view");
    expect(perms).toContain("events:manage");
    expect(perms).toContain("departments:view");
    expect(perms).not.toContain("departments:manage");
    expect(perms).not.toContain("church:manage");
    expect(perms).not.toContain("users:manage");
  });

  it("MINISTER has planning edit, members manage, departments manage, no events:manage", () => {
    const perms = hasPermission("MINISTER");
    expect(perms).toContain("planning:view");
    expect(perms).toContain("planning:edit");
    expect(perms).toContain("members:view");
    expect(perms).toContain("members:manage");
    expect(perms).toContain("events:view");
    expect(perms).not.toContain("events:manage");
    expect(perms).toContain("departments:view");
    expect(perms).toContain("departments:manage");
    expect(perms).not.toContain("church:manage");
    expect(perms).not.toContain("users:manage");
  });

  it("DEPARTMENT_HEAD has planning edit, members manage, no departments:manage", () => {
    const perms = hasPermission("DEPARTMENT_HEAD");
    expect(perms).toContain("planning:view");
    expect(perms).toContain("planning:edit");
    expect(perms).toContain("members:view");
    expect(perms).toContain("members:manage");
    expect(perms).toContain("events:view");
    expect(perms).not.toContain("events:manage");
    expect(perms).toContain("departments:view");
    expect(perms).not.toContain("departments:manage");
    expect(perms).not.toContain("church:manage");
    expect(perms).not.toContain("users:manage");
  });

  it("returns empty array for unknown role", () => {
    const perms = hasPermission("UNKNOWN" as Role);
    expect(perms).toEqual([]);
  });
});

describe("userHasAnyRole", () => {
  const userRoles = [
    { role: "ADMIN" as Role, churchId: "church-1" },
    { role: "MINISTER" as Role, churchId: "church-2" },
  ];

  it("returns true when user has one of the allowed roles", () => {
    expect(userHasAnyRole(userRoles, ["ADMIN"])).toBe(true);
  });

  it("returns false when user has none of the allowed roles", () => {
    expect(userHasAnyRole(userRoles, ["SUPER_ADMIN"])).toBe(false);
  });

  it("filters by churchId when provided", () => {
    expect(userHasAnyRole(userRoles, ["ADMIN"], "church-1")).toBe(true);
    expect(userHasAnyRole(userRoles, ["ADMIN"], "church-2")).toBe(false);
    expect(userHasAnyRole(userRoles, ["MINISTER"], "church-2")).toBe(true);
  });

  it("returns false for empty userRoles", () => {
    expect(userHasAnyRole([], ["ADMIN"])).toBe(false);
  });
});
