import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

function fmt(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtAmount(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:  "En attente",
  PROCESSING: "En traitement",
  APPROVED:   "Validée",
  REJECTED:   "Rejetée",
  CANCELLED:  "Annulée",
};
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:  "text-amber-700 bg-amber-50",
  PROCESSING: "text-blue-700 bg-blue-50",
  APPROVED:   "text-emerald-700 bg-emerald-50",
  REJECTED:   "text-red-600 bg-red-50",
  CANCELLED:  "text-gray-500 bg-gray-100",
};

export default async function PastoralAccountingPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!(session.user.pastoralChurchIds ?? []).length) redirect("/dashboard");

  const currentChurchId = await getCurrentChurchId(session);

  let profile = await prisma.pastoralProfile.findFirst({
    where: {
      userId: session.user.id,
      ...(currentChurchId ? { churchId: currentChurchId } : {}),
    },
    select: { id: true, churchId: true, responsibleForChurch: { select: { id: true } } },
  });
  if (!profile && currentChurchId) {
    profile = await prisma.pastoralProfile.findFirst({
      where: { userId: session.user.id, supervisorForChurches: { some: { id: currentChurchId } } },
      select: { id: true, churchId: true, responsibleForChurch: { select: { id: true } } },
    });
  }
  if (!profile) redirect("/pastoral");

  const activeChurchId = currentChurchId ?? profile.responsibleForChurch?.id ?? profile.churchId;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [requests, overduePayments, church] = await Promise.all([
    prisma.financialRequest.findMany({
      where: { churchId: activeChurchId, createdAt: { gte: yearStart } },
      select: {
        id: true,
        type: true,
        label: true,
        amount: true,
        status: true,
        createdAt: true,
        department: { select: { name: true } },
        submittedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financialPayment.findMany({
      where: {
        request: { churchId: activeChurchId },
        scheduledDate: { lt: now },
        releasedAt: null,
      },
      include: { request: { select: { id: true, label: true } } },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.church.findUnique({ where: { id: activeChurchId }, select: { name: true } }),
  ]);

  // KPIs
  const active = requests.filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED");
  const totalAmount = active.reduce((s, r) => s + Number(r.amount), 0);
  const approvedAmount = requests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + Number(r.amount), 0);
  const pendingAmount = requests.filter((r) => r.status === "SUBMITTED" || r.status === "PROCESSING").reduce((s, r) => s + Number(r.amount), 0);
  const submittedCount = requests.filter((r) => r.status === "SUBMITTED").length;
  const processingCount = requests.filter((r) => r.status === "PROCESSING").length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/pastoral" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
          ← Accueil pastoral
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Comptabilité</h1>
        <p className="text-sm text-gray-500 mt-0.5">{church?.name} · Année {now.getFullYear()}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Budget total", value: fmtAmount(totalAmount), sub: `${active.length} demande${active.length > 1 ? "s" : ""}`, color: "text-icc-violet" },
          { label: "Validé", value: fmtAmount(approvedAmount), sub: `${requests.filter(r => r.status === "APPROVED").length} demandes`, color: "text-emerald-600" },
          { label: "En attente", value: fmtAmount(pendingAmount), sub: `${submittedCount + processingCount} en cours`, color: "text-amber-600" },
          { label: "Retards paiement", value: overduePayments.length.toString(), sub: overduePayments.length > 0 ? "à régulariser" : "Aucun retard", color: overduePayments.length > 0 ? "text-red-600" : "text-gray-500" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Retards */}
      {overduePayments.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">Paiements en retard</p>
          <ul className="space-y-1.5">
            {overduePayments.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <Link href={`/accounting/requests/${p.request.id}`} className="text-red-700 hover:underline truncate max-w-xs">
                  {p.request.label}
                </Link>
                <span className="text-red-600 font-medium shrink-0 ml-2">
                  {fmtAmount(Number(p.amount))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dernières demandes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Demandes {now.getFullYear()}</h2>
          <Link href="/accounting/requests" className="text-xs text-icc-violet hover:underline">
            Voir tout →
          </Link>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aucune demande cette année.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Intitulé</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Département</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Par</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Montant</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.slice(0, 15).map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/accounting/requests/${r.id}`} className="font-medium text-gray-800 hover:text-icc-violet transition-colors">
                        {r.label}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">{fmt(r.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {r.department?.name ?? <span className="italic text-gray-400">Personnel</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{r.submittedBy.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{fmtAmount(Number(r.amount))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "text-gray-600 bg-gray-100"}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
