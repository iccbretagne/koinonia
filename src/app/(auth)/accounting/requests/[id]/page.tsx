import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import RequestDetail from "./RequestDetail";

export default async function AccountingRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const perms = roles.flatMap((r: string) => rolePermissions[r as keyof typeof rolePermissions] ?? []);
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  if (!perms.includes("accounting:view") && !isPastoral) {
    return <p className="p-4 text-gray-500">Accès non autorisé.</p>;
  }

  const req = await prisma.financialRequest.findUnique({
    where: { id },
    include: {
      department:   { select: { id: true, name: true, ministry: { select: { name: true } } } },
      submittedBy:  { select: { id: true, name: true, email: true } },
      processedBy:  { select: { id: true, name: true } },
      payments:     { orderBy: { scheduledDate: "asc" }, include: { releasedBy: { select: { id: true, name: true } } } },
      attachments:  true,
      series:       { select: { id: true, label: true, recurrenceEvery: true, recurrenceUnit: true, status: true } },
      correctionOf: { select: { id: true, label: true, status: true } },
      corrections:  { select: { id: true, label: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!req || req.churchId !== churchId) return notFound();

  const canManage = perms.includes("accounting:manage");
  const isOwn = req.submittedById === session.user.id!;

  // Scope dept_head
  if (!canManage && !isOwn) {
    const userRoles = await prisma.userChurchRole.findMany({
      where: { userId: session.user.id!, churchId },
      include: { departments: { select: { departmentId: true } } },
    });
    const deptIds = userRoles.flatMap((r) => r.departments.map((d) => d.departmentId));
    if (!deptIds.includes(req.departmentId)) return notFound();
  }

  // Prisma returns Decimal objects for amount fields — serialize before passing to Client Component
  const serialized = {
    ...req,
    amount: req.amount.toString(),
    payments: req.payments.map((p) => ({
      ...p,
      amount:         p.amount.toString(),
      releasedAmount: p.releasedAmount?.toString() ?? null,
    })),
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/accounting/requests" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
          ← Demandes
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 font-medium truncate">{req.label}</span>
      </div>
      <RequestDetail
        request={serialized}
        canManage={canManage}
        isOwn={isOwn}
        currentUserId={session.user.id!}
      />
    </div>
  );
}
