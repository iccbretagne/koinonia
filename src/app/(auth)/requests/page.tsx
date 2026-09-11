import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions, registry } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Button from "@/components/ui/Button";
import RequestsList from "./RequestsList";

const ACCOUNTING_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Soumise",
  PROCESSING: "En traitement",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
  CANCELLED: "Annulée",
};

export default async function MyRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("members:view", churchId);

  // « Demandes comptables » (spec 043) : résumé des demandes financières de l'utilisateur —
  // le traitement complet reste sur /accounting/requests, propre à l'équipe comptabilité.
  const churchPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  const showAccountingSection =
    registry.has("accounting") &&
    (churchPermissions.has("accounting:submit") || isPastoral);

  const accountingRequests = showAccountingSection
    ? await prisma.financialRequest.findMany({
        where: { churchId, submittedById: session.user.id! },
        select: { id: true, label: true, amount: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

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
          content: true,
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

      {showAccountingSection && accountingRequests.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Demandes comptables</h2>
            <Link href="/accounting/requests" className="text-sm text-icc-violet hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
            {accountingRequests.map((r) => (
              <Link
                key={r.id}
                href={`/accounting/requests/${r.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-xs text-gray-400">
                    {r.createdAt.toLocaleDateString("fr-FR")} · {Number(r.amount).toFixed(2)} €
                  </p>
                </div>
                <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {ACCOUNTING_STATUS_LABELS[r.status] ?? r.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
