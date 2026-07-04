export type ConfigCategory = "structure" | "members" | "links";
export type MergeStrategy = "SKIP" | "UPDATE" | "REPLACE";

export interface DepartmentConfig {
  id: string;
  name: string;
  isSystem: boolean;
  function: string | null;
}

export interface MinistryConfig {
  id: string;
  name: string;
  isSystem: boolean;
  departments: DepartmentConfig[];
}

export interface MemberConfig {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  departmentIds: string[];
  isPrimaryDeptId: string | null;
}

export interface UserLinkConfig {
  memberId: string;
  userEmail: string;
  churchId: string;
  validatedAt: string | null;
}

export interface UserRoleConfig {
  userEmail: string;
  role: string;
  ministryId: string | null;
  departmentIds: string[];
}

export interface ChurchConfig {
  id: string;
  name: string;
  slug: string;
  secretariatEmail: string | null;
  accountingEmail: string | null;
  primaryColor: string;
  ministries: MinistryConfig[];
  members: MemberConfig[];
  userLinks: UserLinkConfig[];
  userRoles: UserRoleConfig[];
}

export interface KoinoniaConfigExport {
  _meta: {
    appVersion: string;
    exportedAt: string;
    exportedBy: string;
    schemaVersion: 1;
    scope: "all" | string[];
    categories: ConfigCategory[];
  };
  churches: ChurchConfig[];
}

export interface ImportPreview {
  schemaVersion: number;
  exportedAt: string;
  churches: {
    id: string;
    name: string;
    slug: string;
    existsInTarget: boolean;
  }[];
  counts: {
    ministries: number;
    departments: number;
    members: number;
    userLinks: number;
    userRoles: number;
  };
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  warnings: string[];
}
