import type { Session } from "next-auth";
import { ModuleRegistry } from "@/core/module-registry";
import { buildRolePermissions } from "@/core/permissions";
import { allManifests } from "@/lib/manifests";

const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];

/**
 * Implémentations légères de `getUserDepartmentScope` / `getUserMinistryScope` à injecter dans une
 * factory `vi.mock("@/lib/auth", …)`.
 *
 * Le module réel charge next-auth et prisma au niveau module : un test de route handler ne peut pas
 * l'importer, mais les helpers qui en dépendent (`@/lib/member-scope`) ont besoin de ces deux
 * fonctions. Même règle que la vraie : Super Admin / Admin / Secrétaire ne sont pas scopés.
 */
export function createAuthScopeMocks() {
  return {
    getUserDepartmentScope: (session: Session, churchId: string) => {
      const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
      if (session.user.isSuperAdmin || roles.some((r) => GLOBAL_ROLES.includes(r.role))) {
        return { scoped: false as const };
      }
      return {
        scoped: true as const,
        departmentIds: Array.from(
          new Set(roles.flatMap((r) => r.departments.map((d) => d.department.id)))
        ),
      };
    },
    getUserMinistryScope: (session: Session, churchId: string) => {
      const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
      if (session.user.isSuperAdmin || roles.some((r) => GLOBAL_ROLES.includes(r.role))) {
        return { scoped: false as const };
      }
      return {
        scoped: true as const,
        ministryIds: roles.map((r) => r.ministryId).filter((id): id is string => !!id),
      };
    },
  };
}

/** Matrice réelle, construite depuis les manifestes (sans le boot de `@/lib/registry`). */
const manifestRegistry = new ModuleRegistry();
for (const mod of allManifests) manifestRegistry.register(mod);
const manifestRolePermissions = buildRolePermissions(manifestRegistry);

/**
 * `hasChurchPermission` à injecter dans une factory `vi.mock("@/lib/auth", …)` : même règle
 * que la vraie (Super Admin, sinon permissions des rôles de la session dans l'église).
 */
export async function fakeHasChurchPermission(session: Session, permission: string, churchId: string) {
  if (session.user.isSuperAdmin) return true;
  return session.user.churchRoles.some(
    (r) => r.churchId === churchId && (manifestRolePermissions[r.role] ?? []).includes(permission)
  );
}

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
      hasSeenTour: false,
      pastoralProfileId: null,
      pastoralChurchIds: [],
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

/**
 * Session d'un membre de l'équipe Secrétariat sans rôle SECRETARY réel (spec 045) :
 * seule l'entrée synthétique `virtual: true` porte la parité de droits.
 */
export function createSecretariatTeamSession(churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      {
        id: `virtual-secretariat-${churchId}`,
        churchId,
        role: "SECRETARY",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [],
        virtual: true,
      },
    ],
  });
}

export function createPastoralCareReferentSession(churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "PASTORAL_CARE_REFERENT",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [],
      },
    ],
  });
}

export function createStarSession(churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "STAR",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [],
      },
    ],
  });
}

export function createProtocoleMemberSession(
  protocoleDeptId: string,
  churchId = "church-1"
): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "STAR",
        ministryId: null,
        church: { id: churchId, name: "Test Church", slug: "test-church" },
        departments: [{ department: { id: protocoleDeptId, name: "Protocole" } }],
      },
    ],
  });
}

