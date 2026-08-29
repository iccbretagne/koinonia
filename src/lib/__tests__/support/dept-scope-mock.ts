// Réimplémentation fidèle de requireDepartmentAccess pour les tests de routes qui ne
// peuvent pas importer @/lib/auth (charge next-auth). La logique réelle est couverte
// par src/lib/__tests__/scope.test.ts, qui importe la vraie fonction.
type TestSession = {
  user: {
    isSuperAdmin: boolean;
    churchRoles: {
      churchId: string;
      role: string;
      departments: { department: { id: string } }[];
    }[];
  };
};

const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];

export function fakeRequireDepartmentAccess(
  session: TestSession,
  churchId: string,
  departmentId: string
): void {
  if (session.user.isSuperAdmin) return;
  const hasGlobalRole = session.user.churchRoles.some(
    (r) => r.churchId === churchId && GLOBAL_ROLES.includes(r.role)
  );
  if (hasGlobalRole) return;
  const departmentIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (!departmentIds.includes(departmentId)) {
    throw new Error("FORBIDDEN");
  }
}
