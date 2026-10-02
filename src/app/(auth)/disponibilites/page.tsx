import { Suspense } from "react";
import { requireAuth, getCurrentChurchId, getUserDepartmentScope } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { listBackupOptions } from "@/modules/planning";
import AvailabilityClient from "./AvailabilityClient";

/**
 * « Mes disponibilités » (spec 058) : le STAR répond, par événement, pour les collectes ouvertes.
 * Un responsable peut répondre pour un STAR de son périmètre (`absences:manage`).
 */
export default async function AvailabilityPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; event?: string; member?: string }>;
}>) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const { month, event, member } = await searchParams;

  const permissions = new Set(
    session.user.churchRoles.filter((r) => r.churchId === churchId).flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canManage = session.user.isSuperAdmin || permissions.has("absences:manage");
  const canSettings = session.user.isSuperAdmin || permissions.has("availability:settings");

  const links = await prisma.memberUserLink.findMany({
    where: { userId: session.user.id, churchId, validatedAt: { not: null } },
    select: { member: { select: { id: true, firstName: true, lastName: true } } },
  });
  const selfMembers = links.map((l) => l.member);

  let manageableMembers: { id: string; firstName: string; lastName: string }[] = [];
  if (canManage) {
    const deptScope = getUserDepartmentScope(session, churchId);
    manageableMembers = await prisma.member.findMany({
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
  }

  const { eligible: canDesignateBackup, options: backupOptions } = await listBackupOptions(session.user.id, churchId);
  const validMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;

  return (
    <Suspense>
      <AvailabilityClient
        churchId={churchId}
        selfMembers={selfMembers}
        manageableMembers={manageableMembers.filter((m) => !selfMembers.some((s) => s.id === m.id))}
        canDesignateBackup={canDesignateBackup}
        backupOptions={backupOptions}
        canSettings={canSettings}
        initialMonth={validMonth}
        focusEventId={event ?? null}
        initialMemberId={member ?? null}
      />
    </Suspense>
  );
}
