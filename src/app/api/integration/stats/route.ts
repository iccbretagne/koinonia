import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/modules/integration";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const { scope } = await requireIntegrationAccess(churchId);

    const scopeFilter = scope.scoped
      ? { assignedFamilyId: { in: scope.familyIds } }
      : {};

    const baseWhere = { churchId, archivedAt: null, ...scopeFilter };

    // ── Totaux par statut ─────────────────────────────────────────────────────
    const byStatus = await prisma.familyIntegrationRequest.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: true,
    });

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
    const total = byStatus.reduce((s, r) => s + r._count, 0);
    const integrated = statusMap["INTEGRATED"] ?? 0;
    const abandoned = statusMap["ABANDONED"] ?? 0;
    const pending = total - integrated - abandoned;
    const conversionRate = total > 0 ? Math.round((integrated / total) * 100) : null;

    // ── Délai moyen jusqu'à intégration ──────────────────────────────────────
    const completedRequests = await prisma.familyIntegrationRequest.findMany({
      where: { ...baseWhere, status: "INTEGRATED", integratedAt: { not: null } },
      select: { submittedAt: true, integratedAt: true },
    });
    const avgDaysToIntegration =
      completedRequests.length > 0
        ? Math.round(
            completedRequests.reduce((sum, r) => {
              const days = (r.integratedAt!.getTime() - r.submittedAt.getTime()) / 86_400_000;
              return sum + days;
            }, 0) / completedRequests.length
          )
        : null;

    // ── Par famille affectée ──────────────────────────────────────────────────
    const byFamilyRaw = await prisma.familyIntegrationRequest.groupBy({
      by: ["assignedFamilyId", "assignedFamilyName"],
      where: { ...baseWhere, assignedFamilyId: { not: null } },
      _count: true,
      orderBy: { _count: { assignedFamilyId: "desc" } },
      take: 10,
    });
    const byFamily = byFamilyRaw.map((r) => ({
      familyId: r.assignedFamilyId,
      familyName: r.assignedFamilyName ?? "–",
      count: r._count,
    }));

    // ── Par tranche d'âge ────────────────────────────────────────────────────
    const byAgeRange = await prisma.familyIntegrationRequest.groupBy({
      by: ["ageRange"],
      where: baseWhere,
      _count: true,
    });

    // ── Par statut église ────────────────────────────────────────────────────
    const byChurchStatus = await prisma.familyIntegrationRequest.groupBy({
      by: ["churchStatus"],
      where: baseWhere,
      _count: true,
    });

    // ── Tendance mensuelle (12 derniers mois) ────────────────────────────────
    const since = new Date();
    since.setMonth(since.getMonth() - 11);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const recentRequests = await prisma.familyIntegrationRequest.findMany({
      where: { ...baseWhere, submittedAt: { gte: since } },
      select: { submittedAt: true },
    });

    const monthCounts: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(since);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[key] = 0;
    }
    for (const r of recentRequests) {
      const key = `${r.submittedAt.getFullYear()}-${String(r.submittedAt.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthCounts) monthCounts[key]++;
    }
    const byMonth = Object.entries(monthCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // ── Soins pastoraux ───────────────────────────────────────────────────────
    const pastoralCare = await prisma.familyIntegrationRequest.count({
      where: { ...baseWhere, pastoralCareRequested: true },
    });

    return successResponse({
      total,
      pending,
      integrated,
      abandoned,
      conversionRate,
      avgDaysToIntegration,
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count })),
      byFamily,
      byAgeRange: byAgeRange.map((r) => ({ ageRange: r.ageRange, count: r._count })),
      byChurchStatus: byChurchStatus.map((r) => ({ churchStatus: r.churchStatus, count: r._count })),
      byMonth,
      pastoralCare,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
