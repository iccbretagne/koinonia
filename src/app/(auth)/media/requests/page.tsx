import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { DEPT_FN } from "@/lib/department-functions";
import { notFound } from "next/navigation";
import MediaDashboard from "./MediaDashboard";

export default async function MediaRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const mediaDept = await prisma.department.findFirst({
    where: { function: DEPT_FN.PRODUCTION_MEDIA, ministry: { churchId } },
    select: { id: true, name: true },
  });

  if (mediaDept) {
    const userPermissions = new Set(
      session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
    );
    const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");
    const userDeptIds = session.user.churchRoles.flatMap((r) =>
      r.departments.map((d) => d.department.id)
    );
    if (!canManage && !userDeptIds.includes(mediaDept.id)) return notFound();
  }

  if (!mediaDept) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Production Média — Visuels</h1>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Aucun département n&apos;est configuré comme <strong>Production Média</strong>.{" "}
          <a href="/admin/departments/functions" className="underline">
            Configurer maintenant
          </a>
        </div>
      </div>
    );
  }

  const requests = await prisma.request.findMany({
    where: { type: "VISUEL", assignedDeptId: mediaDept.id, churchId },
    include: {
      submittedBy: { select: { name: true, displayName: true } },
      department: { select: { name: true } },
      ministry: { select: { name: true } },
      announcement: {
        select: { id: true, title: true, eventDate: true, isSaveTheDate: true },
      },
      parentRequest: { select: { id: true, type: true, status: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const pending = requests.filter((r) => r.status === "EN_ATTENTE").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Production Média — Visuels</h1>
        {pending > 0 && (
          <span className="bg-icc-violet text-white text-sm font-bold px-2.5 py-1 rounded-full">
            {pending}
          </span>
        )}
      </div>
      <MediaDashboard requests={requests} />
    </div>
  );
}
