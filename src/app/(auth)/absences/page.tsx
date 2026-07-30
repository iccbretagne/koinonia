import { Suspense } from "react";
import { requireAuth, getCurrentChurchId, getUserDepartmentScope } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { listBackupOptions } from "@/modules/planning";
import AbsencesClient from "./AbsencesClient";

export default async function AbsencesPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const userPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canView = session.user.isSuperAdmin || userPermissions.has("absences:view");
  const canManage = session.user.isSuperAdmin || userPermissions.has("absences:manage");

  const memberLinks = await prisma.memberUserLink.findMany({
    where: { userId: session.user.id, churchId },
    select: { memberId: true, member: { select: { firstName: true, lastName: true } } },
  });
  const selfMembers = memberLinks.map((l) => ({
    id: l.memberId,
    firstName: l.member.firstName,
    lastName: l.member.lastName,
  }));

  const ministries = canView
    ? await prisma.ministry.findMany({
        where: { churchId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const departments = canView
    ? await prisma.department.findMany({
        where: { ministry: { churchId } },
        select: { id: true, name: true, ministryId: true },
        orderBy: { name: "asc" },
      })
    : [];

  let manageableMembers: { id: string; firstName: string; lastName: string }[] = [];
  if (canManage) {
    const deptScope = getUserDepartmentScope(session, churchId);
    const members = await prisma.member.findMany({
      where: {
        departments: {
          some: deptScope.scoped
            ? { departmentId: { in: deptScope.departmentIds } }
            : { department: { ministry: { churchId } } },
        },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    manageableMembers = members;
  }

  const { eligible: canDesignateBackup, options: backupOptions } = await listBackupOptions(
    session.user.id,
    churchId
  );

  return (
    <Suspense>
      <AbsencesClient
        churchId={churchId}
        canView={canView}
        canManage={canManage}
        selfMembers={selfMembers}
        manageableMembers={manageableMembers}
        ministries={ministries}
        departments={departments}
        canDesignateBackup={canDesignateBackup}
        backupOptions={backupOptions}
      />
    </Suspense>
  );
}
