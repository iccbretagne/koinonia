import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Button from "@/components/ui/Button";
import AnnouncementsList from "./AnnouncementsList";

export default async function AnnouncementsPage() {
  const session = await requirePermission("planning:view");
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const announcements = await prisma.announcement.findMany({
    where: { churchId, submittedById: session.user.id },
    include: {
      department: { select: { id: true, name: true } },
      ministry: { select: { id: true, name: true } },
      targetEvents: {
        include: { event: { select: { id: true, title: true, date: true } } },
      },
      serviceRequests: {
        where: { parentRequestId: null },
        include: {
          assignedDept: { select: { id: true, name: true } },
          childRequests: {
            select: {
              id: true,
              type: true,
              status: true,
              deliveryLink: true,
              assignedDept: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes annonces</h1>
        <Link href="/announcements/new">
          <Button>+ Nouvelle annonce</Button>
        </Link>
      </div>
      <AnnouncementsList announcements={announcements} />
    </div>
  );
}
