import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AccessClient from "./AccessClient";

export default async function AccessPage() {
  const session = await requirePermission("departments:manage");

  const isSuperAdmin = session.user.isSuperAdmin;
  const isAdmin = isSuperAdmin || session.user.churchRoles.some((r) => r.role === "ADMIN");
  const churchId = await getCurrentChurchId(session);

  if (!churchId) {
    return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  }

  const [ministries, churchUsers] = await Promise.all([
    prisma.ministry.findMany({
      where: { churchId, isSystem: false },
      include: {
        // Ministres : UserChurchRole avec role=MINISTER et ministryId=this.id
        userRoles: {
          where: { role: "MINISTER" },
          include: { user: { select: { id: true, name: true, displayName: true, email: true, image: true } } },
        },
        departments: {
          where: { isSystem: false },
          include: {
            // Responsables de département
            userDepts: {
              where: { userChurchRole: { role: "DEPARTMENT_HEAD" } },
              include: {
                userChurchRole: {
                  include: {
                    user: { select: { id: true, name: true, displayName: true, email: true, image: true } },
                    departments: { select: { departmentId: true, isDeputy: true } },
                  },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Tous les utilisateurs de l'église pour le picker
    prisma.user.findMany({
      where: { churchRoles: { some: { churchId } } },
      select: { id: true, name: true, displayName: true, email: true, image: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des droits d&apos;accès</h1>
        <p className="text-sm text-gray-500 mt-1">
          Assignez les ministres et responsables de département.
        </p>
      </div>

      <AccessClient
        churchId={churchId}
        canManage={isAdmin}
        ministries={ministries.map((m) => ({
          id: m.id,
          name: m.name,
          ministers: m.userRoles.map((r) => ({
            roleId: r.id,
            user: r.user,
            isDeputy: false,
            allDepartments: [],
          })),
          departments: m.departments.map((d) => ({
            id: d.id,
            name: d.name,
            heads: d.userDepts.map((ud) => ({
              roleId: ud.userChurchRole.id,
              user: ud.userChurchRole.user,
              isDeputy: ud.isDeputy,
              allDepartments: ud.userChurchRole.departments.map((x) => ({
                id: x.departmentId,
                isDeputy: x.isDeputy,
              })),
            })),
          })),
        }))}
        allUsers={churchUsers}
      />
    </div>
  );
}
