import { requireAuth, getCurrentChurchId, requireIntegrationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import RequestDetail from "./RequestDetail";

export default async function IntegrationRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const req = await prisma.familyIntegrationRequest.findUnique({
    where: { id },
    include: {
      assignedBerger: { select: { id: true, name: true, email: true } },
      member: { select: { id: true, firstName: true, lastName: true } },
      appointmentRequest: { select: { id: true, status: true } },
    },
  });

  if (!req || req.churchId !== churchId) return notFound();

  const { scope } = await requireIntegrationAccess(churchId);

  if (scope.scoped && req.assignedFamilyId && !scope.familyIds.includes(req.assignedFamilyId))
    return notFound();

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/integration/requests" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
          ← Demandes
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 font-medium">{req.firstName} {req.lastName}</span>
      </div>
      <RequestDetail
        request={req}
        churchId={churchId}
        isScoped={scope.scoped}
        currentUserId={session.user.id!}
      />
    </div>
  );
}
