import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
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
  SUBMITTED:  "text-warning bg-warning-soft",
  PROCESSING: "text-info bg-info-soft",
  APPROVED:   "text-success bg-success-soft",
  REJECTED:   "text-danger bg-danger-soft",
  CANCELLED:  "text-ink-muted bg-surface-sunken",
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
        <Link href="/pastoral" className="text-sm text-ink-subtle hover:text-brand-text transition-colors">
          ← Accueil pastoral
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ink">Comptabilité</h1>
        <p className="text-sm text-ink-muted mt-0.5">{church?.name} · Année {now.getFullYear()}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Budget total", value: fmtAmount(totalAmount), sub: `${active.length} demande${active.length > 1 ? "s" : ""}`, color: "text-brand-text" },
          { label: "Validé", value: fmtAmount(approvedAmount), sub: `${requests.filter(r => r.status === "APPROVED").length} demandes`, color: "text-success" },
          { label: "En attente", value: fmtAmount(pendingAmount), sub: `${submittedCount + processingCount} en cours`, color: "text-warning" },
          { label: "Retards paiement", value: overduePayments.length.toString(), sub: overduePayments.length > 0 ? "à régulariser" : "Aucun retard", color: overduePayments.length > 0 ? "text-danger" : "text-ink-muted" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-surface border border-line rounded-xl p-4 space-y-1">
            <p className="text-xs text-ink-muted">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-ink-subtle">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Retards */}
      {overduePayments.length > 0 && (
        <div className="bg-danger-soft border border-danger/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-danger mb-2">Paiements en retard</p>
          <ul className="space-y-1.5">
            {overduePayments.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <Link href={`/accounting/requests/${p.request.id}`} className="text-danger hover:underline truncate max-w-xs">
                  {p.request.label}
                </Link>
                <span className="text-danger font-medium shrink-0 ml-2">
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
          <h2 className="text-base font-semibold text-ink-muted">Demandes {now.getFullYear()}</h2>
          <Link href="/accounting/requests" className={buttonClasses("ghost", "sm")}>
            Voir tout →
          </Link>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-ink-subtle italic">Aucune demande cette année.</p>
        ) : (
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Intitulé</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted hidden md:table-cell">Département</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted hidden md:table-cell">Par</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted text-right">Montant</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {requests.slice(0, 15).map((r) => (
                  <tr key={r.id} className="hover:bg-surface-sunken transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/accounting/requests/${r.id}`} className="font-medium text-ink hover:text-brand-text transition-colors">
                        {r.label}
                      </Link>
                      <p className="text-xs text-ink-subtle mt-0.5">{fmt(r.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell">
                      {r.department?.name ?? <span className="italic text-ink-subtle">Personnel</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell">{r.submittedBy.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{fmtAmount(Number(r.amount))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "text-ink-muted bg-surface-sunken"}`}>
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
