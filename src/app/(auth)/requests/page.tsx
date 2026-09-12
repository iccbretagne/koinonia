import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions, registry } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { functionForRequestType } from "@/lib/department-functions";
import { getFunctionDepartmentsMap } from "@/lib/function-departments";
import RequestsList from "./RequestsList";
import type { RequestType } from "@/generated/prisma/client";

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
      <RequestsList requests={decoratedRequests} />
    </div>
  );
}
