import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireChurchPermission } from "@/lib/auth";

type Period = "month" | "quarter" | "year";

function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  if (period === "month") {
    from.setDate(1);
  } else if (period === "quarter") {
    from.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  } else {
    from.setMonth(0, 1);
  }
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const period = (searchParams.get("period") ?? "year") as Period;

    if (!churchId) throw new ApiError(400, "churchId requis");
    if (!["month", "quarter", "year"].includes(period)) throw new ApiError(400, "period invalide");

    await requireChurchPermission("accounting:stats", churchId);

    const { from, to } = getPeriodRange(period);

    // ── Demandes de la période ────────────────────────────────────────────────
    const requests = await prisma.financialRequest.findMany({
      where: { churchId, createdAt: { gte: from, lte: to } },
      include: {
        department: { select: { id: true, name: true } },
        payments: {
          select: { amount: true, releasedAt: true, releasedAmount: true, scheduledDate: true },
        },
      },
    });

    // ── Vue d'ensemble ────────────────────────────────────────────────────────
    const allPayments = requests.flatMap((r) => r.payments);
    const releasedAmount = allPayments
      .filter((p) => p.releasedAt !== null)
      .reduce((s, p) => s + Number(p.releasedAmount ?? p.amount), 0);

    const totalAmount = requests
      .filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED")
      .reduce((s, r) => s + Number(r.amount), 0);

    const approvedAmount = requests
      .filter((r) => r.status === "APPROVED")
      .reduce((s, r) => s + Number(r.amount), 0);

    const pendingAmount = requests
      .filter((r) => r.status === "SUBMITTED" || r.status === "PROCESSING")
      .reduce((s, r) => s + Number(r.amount), 0);

    const rejectedCount = requests.filter((r) => r.status === "REJECTED").length;
    const cancelledCount = requests.filter((r) => r.status === "CANCELLED").length;
    const eligibleCount = requests.filter((r) => r.status !== "CANCELLED").length;
    const approvalRate =
      eligibleCount > 0
        ? Math.round(
            (requests.filter((r) => r.status === "APPROVED").length / eligibleCount) * 100
          )
        : null;

    // ── Par statut ────────────────────────────────────────────────────────────
    const statusMap: Record<string, { count: number; amount: number }> = {};
    for (const r of requests) {
      if (!statusMap[r.status]) statusMap[r.status] = { count: 0, amount: 0 };
      statusMap[r.status].count++;
      statusMap[r.status].amount += Number(r.amount);
    }
    const byStatus = Object.entries(statusMap).map(([status, v]) => ({ status, ...v }));

    // ── Par type ──────────────────────────────────────────────────────────────
    const typeMap: Record<string, { count: number; amount: number }> = {};
    for (const r of requests) {
      if (!typeMap[r.type]) typeMap[r.type] = { count: 0, amount: 0 };
      typeMap[r.type].count++;
      typeMap[r.type].amount += Number(r.amount);
    }
    const byType = Object.entries(typeMap).map(([type, v]) => ({ type, ...v }));

    // ── Par département ───────────────────────────────────────────────────────
    const deptMap: Record<string, { name: string; count: number; amount: number; released: number }> =
      {};
    for (const r of requests) {
      const key = r.departmentId ?? "__personal__";
      const name = r.department?.name ?? "Personnel";
      if (!deptMap[key]) deptMap[key] = { name, count: 0, amount: 0, released: 0 };
      deptMap[key].count++;
      deptMap[key].amount += Number(r.amount);
      deptMap[key].released += r.payments
        .filter((p) => p.releasedAt !== null)
        .reduce((s, p) => s + Number(p.releasedAmount ?? p.amount), 0);
    }
    const byDepartment = Object.values(deptMap).sort((a, b) => b.amount - a.amount);

    // ── Tendance mensuelle (12 derniers mois, indépendant de la période) ──────
    const trendSince = new Date();
    trendSince.setMonth(trendSince.getMonth() - 11);
    trendSince.setDate(1);
    trendSince.setHours(0, 0, 0, 0);

    const [trendRequests, trendPayments] = await Promise.all([
      prisma.financialRequest.findMany({
        where: { churchId, createdAt: { gte: trendSince } },
        select: { createdAt: true, amount: true },
      }),
      prisma.financialPayment.findMany({
        where: {
          request: { churchId },
          releasedAt: { gte: trendSince, not: null },
        },
        select: { releasedAt: true, releasedAmount: true, amount: true },
      }),
    ]);

    const monthSubmitted: Record<string, number> = {};
    const monthReleased: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(trendSince);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthSubmitted[key] = 0;
      monthReleased[key] = 0;
    }
    for (const r of trendRequests) {
      const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthSubmitted) monthSubmitted[key] += Number(r.amount);
    }
    for (const p of trendPayments) {
      if (!p.releasedAt) continue;
      const key = `${p.releasedAt.getFullYear()}-${String(p.releasedAt.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthReleased) monthReleased[key] += Number(p.releasedAmount ?? p.amount);
    }
    const byMonth = Object.keys(monthSubmitted)
      .sort()
      .map((month) => ({ month, submitted: monthSubmitted[month], released: monthReleased[month] }));

    // ── Paiements en retard ───────────────────────────────────────────────────
    const overdueRaw = await prisma.financialPayment.findMany({
      where: {
        request: { churchId },
        scheduledDate: { lt: new Date() },
        releasedAt: null,
      },
      include: { request: { select: { id: true, label: true } } },
      orderBy: { scheduledDate: "asc" },
    });
    const overduePayments = overdueRaw.map((p) => ({
      id: p.id,
      requestId: p.request.id,
      requestLabel: p.request.label,
      amount: Number(p.amount),
      scheduledDate: p.scheduledDate.toISOString(),
    }));

    return successResponse({
      period,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      overview: {
        totalRequests: requests.length,
        totalAmount,
        approvedAmount,
        releasedAmount,
        pendingAmount,
        rejectedCount,
        cancelledCount,
        approvalRate,
      },
      byStatus,
      byType,
      byDepartment,
      byMonth,
      overduePayments,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
