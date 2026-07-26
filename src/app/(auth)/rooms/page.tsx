import Link from "next/link";
import { requireChurchPermission, getCurrentChurchId, requireAuth, getUserDepartmentScope } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { isControlTeamMember } from "@/modules/rooms";
import RoomsBookingClient from "./RoomsBookingClient";

export default async function RoomsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("rooms:view", churchId);

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const permissions = new Set(roles.flatMap((r) => rolePermissions[r] ?? []));
  const canReserve = session.user.isSuperAdmin || permissions.has("rooms:reserve");

  let isControlTeam = session.user.isSuperAdmin || permissions.has("rooms:manage");
  if (!isControlTeam) {
    const deptScope = getUserDepartmentScope(session, churchId);
    if (deptScope.scoped) isControlTeam = await isControlTeamMember(deptScope.departmentIds);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Salles</h1>
        {isControlTeam && (
          <Link href="/rooms/checklists" className="text-sm text-icc-violet hover:underline font-medium">
            Contrôle des mains courantes →
          </Link>
        )}
      </div>
      <RoomsBookingClient churchId={churchId} canReserve={canReserve} />
    </div>
  );
}
