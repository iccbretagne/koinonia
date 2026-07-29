import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId, getUserDepartmentScope } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { isControlTeamMember } from "@/modules/rooms";
import { prisma } from "@/lib/prisma";
import RoomChecklistsClient from "./RoomChecklistsClient";

export default async function RoomChecklistsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const permissions = new Set(roles.flatMap((r) => rolePermissions[r] ?? []));
  let authorized = session.user.isSuperAdmin || permissions.has("rooms:manage");

  if (!authorized) {
    const deptScope = getUserDepartmentScope(session, churchId);
    if (deptScope.scoped) {
      authorized = await isControlTeamMember(deptScope.departmentIds);
    }
  }

  if (!authorized) notFound();

  const reservations = await prisma.roomReservation.findMany({
    where: {
      churchId,
      status: "CONFIRMED",
      OR: [
        { checklist: { status: { in: ["OPENED", "CLOSED_DECLARED", "ISSUE_REPORTED", "VALIDATED"] } } },
        { checklist: { status: "PENDING" }, endAt: { lt: new Date() } },
      ],
    },
    include: {
      room: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, displayName: true } },
      checklist: true,
    },
    orderBy: { startAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contrôle des mains courantes</h1>
        <Link href="/rooms" className="text-sm text-icc-violet hover:underline font-medium">
          ← Réservation des salles
        </Link>
      </div>
      <RoomChecklistsClient
        initialReservations={reservations.map((r) => ({
          id: r.id,
          room: r.room,
          title: r.title,
          startAt: r.startAt.toISOString(),
          endAt: r.endAt.toISOString(),
          createdBy: { id: r.createdBy.id, name: r.createdBy.displayName ?? r.createdBy.name },
          checklist: r.checklist
            ? {
                status: r.checklist.status,
                openedAt: r.checklist.openedAt?.toISOString() ?? null,
                keyReceivedFromName: r.checklist.keyReceivedFromName,
                openingNotes: r.checklist.openingNotes,
                closedAt: r.checklist.closedAt?.toISOString() ?? null,
                closedProperly: r.checklist.closedProperly,
                cleaned: r.checklist.cleaned,
                equipmentOk: r.checklist.equipmentOk,
                equipmentNotes: r.checklist.equipmentNotes,
                keyReturnedToName: r.checklist.keyReturnedToName,
                closingNotes: r.checklist.closingNotes,
                incidentNotes: r.checklist.incidentNotes,
                closedWithoutDeclaration: r.checklist.closedWithoutDeclaration,
                validatedAt: r.checklist.validatedAt?.toISOString() ?? null,
                validatedClosedProperly: r.checklist.validatedClosedProperly,
                validatedCleaned: r.checklist.validatedCleaned,
                validatedEquipmentOk: r.checklist.validatedEquipmentOk,
              }
            : null,
        }))}
      />
    </div>
  );
}
