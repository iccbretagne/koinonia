import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader, buttonClasses } from "@/components/ui";
import AccountingDashboard from "./AccountingDashboard";
import { isShuttleVisible } from "@/modules/shuttle/auth";
import { isTreasuryVisible } from "@/modules/treasury/auth";
import AccountingNav from "../AccountingNav";
import { getJustificationSettings, isJustificationClaimable, isRequestArchived } from "@/modules/accounting";
import JustificationSettingsCard from "./JustificationSettingsCard";
import { paths } from "@/lib/paths";

export default async function AccountingRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  const perms = new Set(roles.flatMap((r: string) => rolePermissions[r as keyof typeof rolePermissions] ?? []));
  const isPastoral = (session.user.pastoralChurchIds ?? []).includes(churchId);
  if (!perms.has("accounting:view") && !isPastoral) {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const canManage = perms.has("accounting:manage");
  // `POST /api/accounting/requests` exige `accounting:submit` : le bouton ne s'affiche pas pour
  // un pasteur qui ne l'a pas (spec 092 — jamais de lien vers un refus).
  const canSubmit = perms.has("accounting:submit");
  const canViewStats = perms.has("accounting:stats") || isPastoral;
  const canViewShuttle = await isShuttleVisible(session, churchId);
  const canViewTreasury = await isTreasuryVisible(session, churchId);

  // Scope des demandes visibles :
  // - canManage ou isPastoral → toutes les demandes de l'église
  // - MINISTER → tous les départements de son/ses ministère(s) + ses demandes personnelles
  // - autres → leurs départements assignés + leurs demandes personnelles
  const isMinister = roles.includes("MINISTER");
  let deptFilter: string[] | undefined;
  if (!canManage && !isPastoral) {
    const userRoles = await prisma.userChurchRole.findMany({
      where: { userId: session.user.id!, churchId },
      include: { departments: { select: { departmentId: true } } },
    });
    if (isMinister) {
      const ministryIds = userRoles.map((r) => r.ministryId).filter(Boolean) as string[];
      if (ministryIds.length > 0) {
        const depts = await prisma.department.findMany({
          where: { ministryId: { in: ministryIds } },
          select: { id: true },
        });
        deptFilter = depts.map((d) => d.id);
      } else {
        deptFilter = [];
      }
    } else {
      deptFilter = userRoles.flatMap((r) => r.departments.map((d) => d.departmentId));
    }
  }

  const scopeCondition = deptFilter !== undefined
    ? { OR: [{ departmentId: { in: deptFilter } }, { submittedById: session.user.id!, departmentId: null }] }
    : {};

  const requests = await prisma.financialRequest.findMany({
    where: {
      churchId,
      ...scopeCondition,
    },
    include: {
      department:  { select: { id: true, name: true, function: true } },
      submittedBy: { select: { id: true, name: true } },
      payments:    { select: { id: true, amount: true, scheduledDate: true, releasedAt: true } },
      shuttleReimbursedEntry: { select: { id: true } },
      shuttleImportedEntry:   { select: { id: true } },
      _count:      { select: { attachments: true } },
      justification: { select: { id: true, status: true, dueAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Justificatifs (spec 078) : en retard = attendus après l'échéance.
  const now = new Date();
  const justificationOf = (j: { status: string; dueAt: Date } | null) =>
    j && j.status !== "SETTLED" ? { status: j.status, late: j.status === "AWAITING" && j.dueAt <= now } : null;
  const settings = canManage ? await getJustificationSettings(churchId) : null;

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
    toJustify: requests.filter((r) => justificationOf(r.justification)).length,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comptabilité"
        description={canManage ? "Gestion des demandes financières" : "Mes demandes financières"}
        actions={
          canSubmit && (
            <Link href={paths.accounting.newRequest()} className={buttonClasses("primary", "md")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              Nouvelle demande
            </Link>
          )
        }
      />

      <AccountingNav canViewStats={canViewStats} canViewShuttle={canViewShuttle} canViewTreasury={canViewTreasury} active="requests" />

      <AccountingDashboard
        requests={requests.map((r) => ({
          ...r,
          amount: r.amount.toString(),
          payments: r.payments.map((p) => ({ ...p, amount: p.amount.toString() })),
          justification: justificationOf(r.justification),
          archived: isRequestArchived(r),
          claimable: canManage && isJustificationClaimable({
            ...r,
            justificationId: r.justification?.id ?? null,
            hasAttachment: r._count.attachments > 0,
            departmentFunction: r.department?.function ?? null,
            fromShuttle: !!(r.shuttleReimbursedEntry || r.shuttleImportedEntry),
            isOverage: !!r.overageOfJustificationId,
          }),
        }))}
        stats={stats}
        canManage={canManage}
        currentUserId={session.user.id!}
      />

      {settings && <JustificationSettingsCard initial={settings} />}
    </div>
  );
}
