import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import AccountingDashboard from "./AccountingDashboard";
import AccountingNav from "../AccountingNav";

export default async function AccountingRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const perms = roles.flatMap((r: string) => rolePermissions[r as keyof typeof rolePermissions] ?? []);
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  if (!perms.includes("accounting:view") && !isPastoral) {
    return <p className="p-4 text-gray-500">Accès non autorisé.</p>;
  }

  const canManage = perms.includes("accounting:manage");
  const canSubmit = perms.includes("accounting:submit");
  const canViewStats = perms.includes("accounting:stats") || (session.user.pastoralChurchIds ?? []).includes(churchId);

  // Scope : DEPARTMENT_HEAD → ses départements uniquement ; pastoral → toute l'église
  let deptFilter: string[] | undefined;
  if (!canManage && !isPastoral) {
    const userRoles = await prisma.userChurchRole.findMany({
      where: { userId: session.user.id!, churchId },
      include: { departments: { select: { departmentId: true } } },
    });
    deptFilter = userRoles.flatMap((r) => r.departments.map((d) => d.departmentId));
  }

  const requests = await prisma.financialRequest.findMany({
    where: {
      churchId,
      ...(deptFilter ? { departmentId: { in: deptFilter } } : {}),
    },
    include: {
      department:  { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      payments:    { select: { id: true, amount: true, scheduledDate: true, releasedAt: true } },
      _count:      { select: { attachments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Statistiques simplifiées
  const stats = {
    submitted:  requests.filter((r) => r.status === "SUBMITTED").length,
    processing: requests.filter((r) => r.status === "PROCESSING").length,
    approved:   requests.filter((r) => r.status === "APPROVED").length,
    rejected:   requests.filter((r) => r.status === "REJECTED").length,
    totalAmount: requests
      .filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED")
      .reduce((sum, r) => sum + Number(r.amount), 0),
    pendingPayments: requests
      .flatMap((r) => r.payments)
      .filter((p) => !p.releasedAt).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comptabilité</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {canManage ? "Gestion des demandes financières" : "Mes demandes financières"}
          </p>
        </div>
        {canSubmit && (
          <Link
            href="/accounting/requests/new"
            className="flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle demande
          </Link>
        )}
      </div>

      <AccountingNav canViewStats={canViewStats} active="requests" />

      <AccountingDashboard
        requests={requests.map((r) => ({
          ...r,
          amount: r.amount.toString(),
          payments: r.payments.map((p) => ({ ...p, amount: p.amount.toString() })),
        }))}
        stats={stats}
        canManage={canManage}
        currentUserId={session.user.id!}
      />
    </div>
  );
}
