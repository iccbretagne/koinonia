import { requirePermission, getUserDepartmentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DepartmentsClient from "./DepartmentsClient";

export default async function DepartmentsPage() {
  const session = await requirePermission("departments:manage");

  const scope = getUserDepartmentScope(session);
  const churchRoles = session.user.churchRoles;
  const isSuperAdmin = churchRoles.some((r) => r.role === "SUPER_ADMIN");
  const churchIds = Array.from(new Set(churchRoles.map((r) => r.churchId)));

  // For scoped users (MINISTER), get their ministryIds
  const ministerMinistryIds = churchRoles
    .filter((r) => r.role === "MINISTER" && r.ministryId)
    .map((r) => r.ministryId as string);

  const departmentWhere = isSuperAdmin
    ? undefined
    : scope.scoped && ministerMinistryIds.length > 0
      ? { ministryId: { in: ministerMinistryIds } }
      : { ministry: { churchId: { in: churchIds } } };

  const departments = await prisma.department.findMany({
    where: departmentWhere,
    include: {
      ministry: { select: { id: true, name: true, churchId: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  const ministryWhere = isSuperAdmin
    ? undefined
    : ministerMinistryIds.length > 0
      ? { id: { in: ministerMinistryIds } }
      : { churchId: { in: churchIds } };

  const ministries = await prisma.ministry.findMany({
    where: ministryWhere,
    include: { church: { select: { id: true, name: true } } },
    orderBy: [{ church: { name: "asc" } }, { name: "asc" }],
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
