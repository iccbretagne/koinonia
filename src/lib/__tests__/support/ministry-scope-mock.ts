// Réimplémentation fidèle de getUserMinistryScope pour les tests de routes qui ne
// peuvent pas importer @/lib/auth (charge next-auth). La logique réelle est couverte
// par src/lib/__tests__/scope.test.ts, qui importe la vraie fonction.
type TestSession = {
  user: {
    isSuperAdmin: boolean;
    churchRoles: { churchId: string; role: string; ministryId: string | null }[];
  };
};

const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];

export function fakeGetUserMinistryScope(
  session: TestSession,
  churchId: string
): { scoped: false } | { scoped: true; ministryIds: string[] } {
  if (session.user.isSuperAdmin) return { scoped: false };
  const hasGlobalRole = session.user.churchRoles.some(
    (r) => r.churchId === churchId && GLOBAL_ROLES.includes(r.role)
  );
  if (hasGlobalRole) return { scoped: false };
  const ministryIds = Array.from(
    new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === churchId && r.ministryId)
        .map((r) => r.ministryId as string)
    )
  );
  return { scoped: true, ministryIds };
}
