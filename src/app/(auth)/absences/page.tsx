import { Suspense } from "react";
import { requireAuth, getCurrentChurchId, getUserDepartmentScope } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { getDeclarerBackupScope } from "@/modules/planning";
import AbsencesClient from "./AbsencesClient";

interface BackupOption {
  value: string;
  label: string;
}

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

  const declarerScope = await getDeclarerBackupScope(session.user.id, churchId);
  const canDesignateBackup = declarerScope.isDepartmentHead || declarerScope.isMinister;

  let backupOptions: BackupOption[] = [];
  if (canDesignateBackup) {
    const starMembers = await prisma.member.findMany({
      where: { departments: { some: { departmentId: { in: declarerScope.departmentIds } } } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const starOptions: BackupOption[] = starMembers.map((m) => ({
      value: `STAR:${m.id}`,
      label: `${m.firstName} ${m.lastName} (STAR)`,
    }));

    const responsibleRoles: { id: string; role: string; user: { name: string | null; displayName: string | null } }[] = [];
    if (declarerScope.isMinister) {
      const ministers = await prisma.userChurchRole.findMany({
        where: { churchId, role: "MINISTER", userId: { not: session.user.id } },
        select: { id: true, role: true, user: { select: { name: true, displayName: true } } },
      });
      responsibleRoles.push(...ministers);
    }
    if (declarerScope.isDepartmentHead) {
      const depts = await prisma.department.findMany({
        where: { id: { in: declarerScope.departmentIds } },
        select: { ministryId: true },
      });
      const ministryIds = Array.from(new Set(depts.map((d) => d.ministryId)));
      const peers = await prisma.userChurchRole.findMany({
        where: {
          churchId,
          userId: { not: session.user.id },
          OR: [
            { role: "MINISTER", ministryId: { in: ministryIds } },
            { role: "DEPARTMENT_HEAD", departments: { some: { department: { ministryId: { in: ministryIds } } } } },
          ],
        },
        select: { id: true, role: true, user: { select: { name: true, displayName: true } } },
      });
      responsibleRoles.push(...peers);
    }

    const responsibleOptions: BackupOption[] = Array.from(
      new Map(responsibleRoles.map((r) => [r.id, r])).values()
    ).map((r) => ({
      value: `RESPONSIBLE:${r.id}`,
      label: `${r.user.displayName ?? r.user.name} (${r.role === "MINISTER" ? "Ministre" : "Resp. département"})`,
    }));

    backupOptions = [...starOptions, ...responsibleOptions];
  }

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
