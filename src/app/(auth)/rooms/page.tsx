import Link from "next/link";
import { requireChurchPermission, getCurrentChurchId, requireAuth, getUserDepartmentScope } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { isControlTeamMember } from "@/modules/rooms";
import RoomsBookingClient from "./RoomsBookingClient";
import { buttonClasses } from "@/components/ui/button-classes";
import PageHeader from "@/components/ui/PageHeader";
import { paths } from "@/lib/paths";

export default async function RoomsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("rooms:view", churchId);

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const permissions = new Set(roles.flatMap((r) => rolePermissions[r] ?? []));
  const canReserve = session.user.isSuperAdmin || permissions.has("rooms:reserve");
  const canManage = session.user.isSuperAdmin || permissions.has("rooms:manage");

  let isControlTeam = session.user.isSuperAdmin || permissions.has("rooms:manage");
  if (!isControlTeam) {
    const deptScope = getUserDepartmentScope(session, churchId);
    if (deptScope.scoped) isControlTeam = await isControlTeamMember(deptScope.departmentIds);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salles"
        actions={
          isControlTeam && (
            <Link href={paths.rooms.checklists()} className={buttonClasses("secondary")}>
              Contrôler les mains courantes
            </Link>
          )
        }
      />
      <RoomsBookingClient
        churchId={churchId}
        canReserve={canReserve}
        canManage={canManage}
        currentUserId={session.user.id}
      />
    </div>
  );
}
