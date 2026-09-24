import { requireAuth, resolveChurchId } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getCareAccess,
  getAppointmentRequestById,
  resolveRequestReaderAccess,
  projectRequest,
} from "@/modules/care";
import RequestActions from "./RequestActions";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

export default async function CareRequestDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const churchId = await resolveChurchId("appointmentRequest", id);
  const session = await requireAuth();
  const access = await getCareAccess(session, churchId);

  const item = await getAppointmentRequestById(id);
  if (!item || item.churchId !== churchId) return notFound();

  const readerAccess = resolveRequestReaderAccess({
    canQualify: access.canQualify,
    currentUserId: access.userId,
    assignedToUserId: item.assignedTo?.userId ?? null,
  });
  if (!access.canOverview && !readerAccess.canReadContent) return notFound();

  const projected = projectRequest(item, readerAccess);

  const profiles = access.canQualify
    ? await prisma.pastoralProfile.findMany({
        where: { churchId },
        select: { id: true, name: true, role: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      })
    : [];

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/care" className="text-sm text-gray-400 hover:text-icc-violet transition-colors mb-4 inline-block">
        ← Suivi pastoral
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{item.firstName} {item.lastName}</h1>
      <p className="text-sm text-gray-500 mb-6">{STATUS_LABEL[item.status] ?? item.status}</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm text-gray-600">
          {item.email} {item.phone && `· ${item.phone}`}
        </p>
        {!projected.masked ? (
          <>
            <p className="text-sm font-medium text-gray-800">{projected.subject}</p>
            <p className="text-sm text-gray-600 whitespace-pre-line">{projected.message}</p>
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">Contenu confidentiel — réservé au référent et à l&apos;accompagnant en charge.</p>
        )}
        {item.assignedTo && (
          <p className="text-sm text-gray-600">Accompagnant : <strong>{item.assignedTo.name}</strong></p>
        )}
      </div>

      {access.canQualify && item.status === "PENDING" && (
        <div className="mt-4">
          <RequestActions requestId={id} profiles={profiles} />
        </div>
      )}
    </div>
  );
}
