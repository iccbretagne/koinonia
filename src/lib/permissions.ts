import type { Role } from "@/generated/prisma/client";

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [
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
    "discipleship:view",
    "discipleship:manage",
    "discipleship:export",
    "reports:view",
    "reports:edit",
    "accounting:view",
    "accounting:manage",
    "accounting:stats",
    "accounting:submit",
    "absences:view",
    "absences:manage",
  ],
  ADMIN: [
    "planning:view",
    "planning:edit",
    "members:view",
    "members:manage",
    "events:view",
    "events:manage",
    "departments:view",
    "departments:manage",
    "discipleship:view",
    "discipleship:manage",
    "reports:view",
    "reports:edit",
    "accounting:view",
    "accounting:manage",
    "accounting:stats",
    "accounting:submit",
    "absences:view",
    "absences:manage",
  ],
  SECRETARY: [
    "planning:view",
    "members:view",
    "events:view",
    "events:manage",
    "departments:view",
    "discipleship:view",
    "discipleship:manage",
    "discipleship:export",
    "reports:view",
    "reports:edit",
    "accounting:stats",
    "absences:view",
    "absences:manage",
  ],
  MINISTER: [
    "planning:view",
    "planning:edit",
    "members:view",
    "members:manage",
    "events:view",
    "departments:view",
    "departments:manage",
    "discipleship:view",
    "accounting:view",
    "accounting:submit",
    "absences:view",
    "absences:manage",
  ],
  DEPARTMENT_HEAD: [
    "planning:view",
    "planning:edit",
    "members:view",
    "members:manage",
    "events:view",
    "departments:view",
    "discipleship:view",
    "accounting:view",
    "accounting:submit",
    "absences:view",
    "absences:manage",
  ],
  DISCIPLE_MAKER: [
    "discipleship:view",
    "discipleship:manage",
  ],
  REPORTER: [
    "events:view",
    "reports:view",
    "reports:edit",
  ],
  STAR: [
    "planning:view",
  ],
  AGENDA_QUALIFIER: [
    "agenda:qualify",
    "agenda:view",
  ],
  ACCOUNTANT: [
    "accounting:view",
    "accounting:manage",
    "accounting:stats",
  ],
};

/**
 * @deprecated Utiliser `rolePermissions` depuis `@/lib/registry` à la place.
 * Cette fonction sera supprimée quand la migration Phase 2 sera complète.
 */
export function hasPermission(role: Role): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

