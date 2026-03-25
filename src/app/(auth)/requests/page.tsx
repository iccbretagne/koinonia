import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Button from "@/components/ui/Button";
import RequestsList from "./RequestsList";

export default async function MyRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  // All requests submitted by the user (both announcement-linked and standalone)
  const requests = await prisma.request.findMany({
    where: {
      churchId,
      submittedById: session.user.id,
      parentRequestId: null,
    },
    include: {
      department: { select: { id: true, name: true } },
      ministry: { select: { id: true, name: true } },
      assignedDept: { select: { id: true, name: true } },
      announcement: {
        select: {
          id: true,
          title: true,
          status: true,
          eventDate: true,
          isSaveTheDate: true,
        },
      },
      childRequests: {
        select: {
          id: true,
          type: true,
          status: true,
          payload: true,
          assignedDept: { select: { id: true, name: true } },
        },
      },
      reviewedBy: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes demandes</h1>
        <Link href="/requests/new">
          <Button>+ Nouvelle demande</Button>
        </Link>
      </div>
      <RequestsList requests={requests} />
    </div>
  );
}
