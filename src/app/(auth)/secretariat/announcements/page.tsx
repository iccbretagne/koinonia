import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { DepartmentFunction } from "@prisma/client";
import { notFound } from "next/navigation";
import SecretariatDashboard from "./SecretariatDashboard";

export default async function SecretariatAnnouncementsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const secretariatDept = await prisma.department.findFirst({
    where: { function: DepartmentFunction.SECRETARIAT, ministry: { churchId } },
    select: { id: true, name: true },
  });

  // Allow: events:manage (Admin, Secrétaire) OR member/minister of the secretariat dept
  if (secretariatDept) {
    const userPermissions = new Set(
      session.user.churchRoles.flatMap((r) => hasPermission(r.role))
    );
    const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");
    const userDeptIds = session.user.churchRoles.flatMap((r) =>
      r.departments.map((d) => d.department.id)
    );
    const isDeptMember = userDeptIds.includes(secretariatDept.id);
    if (!canManage && !isDeptMember) return notFound();
  }

  if (!secretariatDept) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Secrétariat — Annonces</h1>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Aucun département n&apos;est configuré comme <strong>Secrétariat</strong>.{" "}
          <a href="/admin/departments/functions" className="underline">
            Configurer maintenant
          </a>
        </div>
      </div>
    );
  }

  const announcements = await prisma.announcement.findMany({
    where: {
      churchId,
      serviceRequests: {
        some: {
          type: "DIFFUSION_INTERNE",
          assignedDeptId: secretariatDept.id,
        },
      },
    },
    include: {
      submittedBy: { select: { name: true, displayName: true } },
      department: { select: { name: true } },
      ministry: { select: { name: true } },
      targetEvents: {
        include: { event: { select: { id: true, title: true, date: true } } },
      },
      serviceRequests: {
        where: { type: "DIFFUSION_INTERNE", assignedDeptId: secretariatDept.id },
        include: {
          childRequests: {
            select: {
              id: true,
              type: true,
              status: true,
              deliveryLink: true,
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  const pending = announcements.filter((a) =>
    a.serviceRequests.some((sr) => sr.status === "EN_ATTENTE")
  ).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Secrétariat — Annonces</h1>
        {pending > 0 && (
          <span className="bg-icc-violet text-white text-sm font-bold px-2.5 py-1 rounded-full">
            {pending}
          </span>
        )}
      </div>
      <SecretariatDashboard announcements={announcements} />
    </div>
  );
}
