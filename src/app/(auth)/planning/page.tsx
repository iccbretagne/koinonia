import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MyPlanningView from "./MyPlanningView";

export default async function MyPlanningPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  // Resolve the linked member for this user + church
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true, member: { select: { firstName: true, lastName: true } } },
  });

  if (!link) {
    // User has planning:view but no member link — show empty state
    return (
      <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
        <p className="text-lg font-medium">Aucun compte STAR lié</p>
        <p className="text-sm mt-1">
          Rendez-vous dans votre profil pour lier votre compte à un membre.
        </p>
        <a
          href="/profile"
          className="inline-block mt-4 text-sm text-icc-violet hover:underline"
        >
          Gérer mon profil →
        </a>
      </div>
    );
  }

  const plannings = await prisma.planning.findMany({
    where: { memberId: link.memberId },
    include: {
      eventDepartment: {
        include: {
          event: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
            },
          },
          department: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { eventDepartment: { event: { date: "asc" } } },
  });

  const memberName = `${link.member.firstName} ${link.member.lastName}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mon planning</h1>
        <p className="text-sm text-gray-500 mt-1">{memberName}</p>
      </div>
      <MyPlanningView plannings={plannings} />
    </div>
  );
}
