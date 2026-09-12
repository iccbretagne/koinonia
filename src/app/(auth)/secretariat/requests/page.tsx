import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { DEPT_FN, requestTypesForFunction } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";
import { notFound } from "next/navigation";
import RequestsDashboard from "./RequestsDashboard";

export default async function SecretariatRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const secretariatDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.SECRETARIAT);

  // Access check: events:manage OR member of secretariat dept
  // Permissions calculées sur l'église courante uniquement (spec 024) — sinon un
  // responsable de l'église A obtient events:manage dans l'église B (issue #490).
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPermissions = new Set(churchRoles.flatMap((r) => rolePermissions[r.role] ?? []));
  const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");

  if (secretariatDeptIds.length > 0) {
    const userDeptIds = churchRoles.flatMap((r) => r.departments.map((d) => d.department.id));
    const isDeptMember = userDeptIds.some((id) => secretariatDeptIds.includes(id));
    if (!canManage && !isDeptMember) return notFound();
  }

  if (secretariatDeptIds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Traitement des demandes</h1>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Aucun département n&apos;est configuré comme <strong>Secrétariat</strong>.{" "}
          <a href="/admin/departments/functions" className="underline">
            Configurer maintenant
          </a>
        </div>
      </div>
    );
  }

  // Fetch all requests whose type is routed to the Secrétariat function (spec 046)
  // This includes DIFFUSION_INTERNE (announcements) AND demand types
  const requests = await prisma.request.findMany({
    where: {
      churchId,
      type: { in: requestTypesForFunction(DEPT_FN.SECRETARIAT) },
      parentRequestId: null,
    },
    include: {
      submittedBy: { select: { name: true, displayName: true } },
      department: { select: { name: true } },
      ministry: { select: { name: true } },
      announcement: {
        select: {
          id: true,
          title: true,
          content: true,
          eventDate: true,
          isSaveTheDate: true,
          isUrgent: true,
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
      reviewedBy: { select: { name: true, displayName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const pending = requests.filter((r) => r.status === "EN_ATTENTE").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Traitement des demandes</h1>
        {pending > 0 && (
          <span className="bg-icc-violet text-white text-sm font-bold px-2.5 py-1 rounded-full">
            {pending}
          </span>
        )}
      </div>
      <RequestsDashboard requests={requests} canManage={canManage} />
    </div>
  );
}
