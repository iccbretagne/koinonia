import { requireChurchPermission, getCurrentChurchId, requireAuth, getUserDepartmentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DepartmentsClient from "./DepartmentsClient";

export default async function DepartmentsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("departments:manage", churchId);

  const scope = getUserDepartmentScope(session, churchId);
  const isSuperAdmin = session.user.churchRoles.some((r) => r.role === "SUPER_ADMIN");

  // For scoped users (MINISTER), get their ministryIds in this church
  const ministerMinistryIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId && r.role === "MINISTER" && r.ministryId)
    .map((r) => r.ministryId as string);

  const departmentWhere = scope.scoped && ministerMinistryIds.length > 0
    ? { ministryId: { in: ministerMinistryIds } }
    : { ministry: { churchId } };

  const departments = await prisma.department.findMany({
    where: departmentWhere,
    include: {
      ministry: { select: { id: true, name: true, churchId: true } },
      _count: { select: { memberDepts: true } },
    },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  const ministryWhere = ministerMinistryIds.length > 0
    ? { id: { in: ministerMinistryIds } }
    : { churchId };

  const ministries = await prisma.ministry.findMany({
    where: ministryWhere,
    include: { church: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Départements</h1>
      <DepartmentsClient
        initialDepartments={departments}
        ministries={ministries.map((m) => ({
          id: m.id,
          name: m.name,
          churchName: m.church.name,
        }))}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
