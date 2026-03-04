import type { Session } from "next-auth";

// Factory helpers for creating test sessions
export function createSession(overrides: Partial<Session["user"]> = {}): Session {
  return {
    user: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      displayName: null,
      image: null,
      isSuperAdmin: false,
      churchRoles: [
        {
          id: "role-1",
          churchId: "church-1",
          role: "ADMIN",
          ministryId: null,
          church: { id: "church-1", name: "Test Church", slug: "test-church" },
          departments: [],
        },
      ],
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function createAdminSession(churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "ADMIN",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [],
      },
    ],
  });
}

export function createSuperAdminSession(): Session {
  return createSession({
    isSuperAdmin: true,
    churchRoles: [
      {
        id: "role-1",
        churchId: "church-1",
        role: "SUPER_ADMIN",
        ministryId: null,
        church: { id: "church-1", name: "Test Church", slug: "test-church" },
        departments: [],
      },
    ],
  });
}

export function createMinisterSession(
  ministryId: string,
  churchId = "church-1"
): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "MINISTER",
        ministryId,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [
          { department: { id: "dept-1", name: "Choristes" } },
          { department: { id: "dept-2", name: "Musiciens" } },
        ],
      },
    ],
  });
}

export function createDepartmentHeadSession(
  departmentIds: { id: string; name: string }[],
  churchId = "church-1"
): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "DEPARTMENT_HEAD",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: departmentIds.map((d) => ({ department: d })),
      },
    ],
  });
}

export function createSecretarySession(churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "SECRETARY",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [],
      },
    ],
  });
}

