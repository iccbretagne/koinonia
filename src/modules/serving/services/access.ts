import type { Role, ServingAssignmentStatus } from "@/generated/prisma/client";
import { ACTIVE_ASSIGNMENT_STATUSES, WELCOMED_ASSIGNMENT_STATUSES } from "./state";

/**
 * Règles d'accès pures des candidatures (spec 073). Les gardes de `../auth.ts` chargent les
 * données (départements PVS, fiches STAR liées) puis appellent ces fonctions — testées sur des
 * sessions fabriquées.
 *
 * Aucune ouverture globale par rôle hors `serving:manage` : le Secrétaire, par exemple, voit tous
 * les départements ailleurs dans l'application mais n'a aucun accès aux candidatures.
 */

export type ServingUser = {
  isSuperAdmin: boolean;
  churchRoles: readonly {
    churchId: string;
    role: Role;
    ministryId: string | null;
    departments: readonly { department: { id: string } }[];
  }[];
};

export type RolePermissions = Readonly<Record<string, readonly string[] | undefined>>;

export type DepartmentRef = { id: string; ministryId: string };

function rolesIn(user: ServingUser, churchId: string) {
  return user.churchRoles.filter((r) => r.churchId === churchId);
}

function hasPermission(user: ServingUser, churchId: string, rolePermissions: RolePermissions, permission: string) {
  return rolesIn(user, churchId).some((r) => rolePermissions[r.role]?.includes(permission));
}

/**
 * Membre de l'équipe PVS : un rôle de l'église dont les départements comptent un département de
 * fonction `VIE_DES_STAR`. Couvre le responsable (lignes `user_departments`), le STAR dont la
 * fiche liée appartient au PVS et le Ministre du ministère du PVS (départements injectés dans la
 * session) — même lecture que les autres équipes de fonction (`isCaptureTeamMember`).
 */
export function isPvsTeamMember(user: ServingUser, churchId: string, pvsDeptIds: readonly string[]): boolean {
  if (pvsDeptIds.length === 0) return false;
  return rolesIn(user, churchId).some((r) => r.departments.some((d) => pvsDeptIds.includes(d.department.id)));
}

/** Étude et traitement des candidatures avant affectation : PVS, Admin, Super Admin. */
export function canManageApplications(
  user: ServingUser,
  churchId: string,
  pvsDeptIds: readonly string[],
  rolePermissions: RolePermissions
): boolean {
  if (user.isSuperAdmin) return true;
  if (hasPermission(user, churchId, rolePermissions, "serving:manage")) return true;
  return isPvsTeamMember(user, churchId, pvsDeptIds);
}

/** Responsable (principal ou adjoint) du département, ou Ministre de son ministère. */
export function isDepartmentLead(user: ServingUser, churchId: string, dept: DepartmentRef): boolean {
  return rolesIn(user, churchId).some(
    (r) =>
      (r.role === "DEPARTMENT_HEAD" && r.departments.some((d) => d.department.id === dept.id)) ||
      (r.role === "MINISTER" && r.ministryId === dept.ministryId)
  );
}

type AssignmentRef = { status: ServingAssignmentStatus; department: DepartmentRef };

/**
 * Lecture de la fiche : gestionnaires, ou responsable/Ministre d'un département dont
 * l'affectation est active. Un département qui a renvoyé ne voit plus la fiche.
 */
export function canViewApplication(
  user: ServingUser,
  churchId: string,
  canManage: boolean,
  assignments: readonly AssignmentRef[]
): boolean {
  if (canManage) return true;
  return assignments.some(
    (a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status) && isDepartmentLead(user, churchId, a.department)
  );
}

/** Accueillir, confirmer ou renvoyer une affectation : son département seulement. */
export function canDecideAssignment(user: ServingUser, churchId: string, dept: DepartmentRef): boolean {
  return user.isSuperAdmin || isDepartmentLead(user, churchId, dept);
}

/**
 * Le STAR consulte sa propre fiche (D8) : compte lié (lien validé) à la fiche STAR de la
 * candidature, et au moins un département l'a accueilli.
 */
export function isOwnApplication(
  linkedMemberIds: readonly string[],
  app: { memberId: string | null; assignments: readonly { status: ServingAssignmentStatus }[] }
): boolean {
  if (!app.memberId || !linkedMemberIds.includes(app.memberId)) return false;
  return app.assignments.some((a) => WELCOMED_ASSIGNMENT_STATUSES.includes(a.status));
}

/** Réglages (durées, adresse email du PVS) : Super Admin, Admin, responsable du PVS. */
export function canEditSettings(
  user: ServingUser,
  churchId: string,
  pvsDeptIds: readonly string[],
  rolePermissions: RolePermissions
): boolean {
  if (user.isSuperAdmin) return true;
  if (hasPermission(user, churchId, rolePermissions, "serving:manage")) return true;
  return rolesIn(user, churchId).some(
    (r) => r.role === "DEPARTMENT_HEAD" && r.departments.some((d) => pvsDeptIds.includes(d.department.id))
  );
}
