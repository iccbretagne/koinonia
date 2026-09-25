import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions, registry } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { functionForRequestType } from "@/lib/department-functions";
import { getFunctionDepartmentsMap } from "@/lib/function-departments";
import RequestsList from "./RequestsList";
import type { RequestType } from "@/generated/prisma/client";
import { listMyRequests, REJECT_REASON_LABELS } from "@/modules/care";

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const APPOINTMENT_STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  VALIDATED: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-600",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function MyRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("members:view", churchId);

  // Les demandes comptables ont leur propre espace (spec 043) : on n'en duplique plus un extrait
  // ici, un lien en tête de page y renvoie.
  const churchPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  const showAccountingLink =
    registry.has("accounting") &&
    (churchPermissions.has("accounting:submit") || isPastoral);

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
        },
      },
      reviewedBy: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const allTypes = new Set<RequestType>();
  for (const r of requests) {
    allTypes.add(r.type);
    for (const child of r.childRequests) allTypes.add(child.type);
  }
  const fnsNeeded = Array.from(new Set(Array.from(allTypes).map(functionForRequestType)));
  const deptsByFn = await getFunctionDepartmentsMap(churchId, fnsNeeded);

  function decorate<T extends { type: RequestType }>(r: T) {
    const fn = functionForRequestType(r.type);
    return { ...r, assignedFunction: fn, assignedDepts: deptsByFn.get(fn) ?? [] };
  }

  const decoratedRequests = requests.map((r) => ({
    ...decorate(r),
    childRequests: r.childRequests.map(decorate),
  }));

  const appointmentRequests = registry.has("care")
    ? await listMyRequests(session.user.id!, churchId)
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes demandes</h1>
        <div className="flex flex-wrap items-center gap-2">
          {showAccountingLink && (
            <Link href="/accounting/requests" className={buttonClasses("secondary")}>
              Mes demandes comptables →
            </Link>
          )}
          <Link href="/requests/new" className={buttonClasses("primary")}>
            + Nouvelle demande
          </Link>
        </div>
      </div>
      {appointmentRequests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Rendez-vous pastoraux</h2>
          <div className="space-y-2">
            {appointmentRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{r.subject}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(r.scheduledFor ?? r.createdAt).toLocaleDateString("fr-FR")}
                    {r.status === "REJECTED" && r.rejectReasonCode && (
                      <> · {REJECT_REASON_LABELS[r.rejectReasonCode] ?? r.rejectReasonCode}</>
                    )}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${APPOINTMENT_STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {APPOINTMENT_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <RequestsList requests={decoratedRequests} />
    </div>
  );
}
