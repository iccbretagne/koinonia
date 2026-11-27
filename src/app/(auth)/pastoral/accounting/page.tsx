import { requirePastoralActiveChurch } from "../active-church";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Alert, PageHeader, StatusChip, buttonClasses, type StatusTone } from "@/components/ui";
import { getAccountingDepartmentScope } from "@/modules/accounting";
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
const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED:  "warning",
  PROCESSING: "info",
  APPROVED:   "success",
  REJECTED:   "danger",
  CANCELLED:  "neutral",
};

export default async function PastoralAccountingPage() {
  const { session, activeChurchId } = await requirePastoralActiveChurch();

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
        departmentId: true,
        submittedById: true,
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
      include: { request: { select: { id: true, label: true, departmentId: true, submittedById: true } } },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.church.findUnique({ where: { id: activeChurchId }, select: { name: true } }),
  ]);

  // Le détail d'une demande (`/accounting/requests/[id]`) n'est ouvert qu'aux gestionnaires, au
  // demandeur et au périmètre de départements de l'appelant : hors de ce périmètre, la ligne
  // n'est pas un lien (spec 092 — jamais de lien vers un refus ; lecture pastorale au lot 3).
  const scope = await getAccountingDepartmentScope(session, activeChurchId);
  const canOpen = (r: { departmentId: string | null; submittedById: string }) =>
    scope === null || r.submittedById === session.user.id || (r.departmentId !== null && scope.includes(r.departmentId));

  // KPIs
  const active = requests.filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED");
  const totalAmount = active.reduce((s, r) => s + Number(r.amount), 0);
  const approvedAmount = requests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + Number(r.amount), 0);
  const pendingAmount = requests.filter((r) => r.status === "SUBMITTED" || r.status === "PROCESSING").reduce((s, r) => s + Number(r.amount), 0);
  const submittedCount = requests.filter((r) => r.status === "SUBMITTED").length;
  const processingCount = requests.filter((r) => r.status === "PROCESSING").length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

      <PageHeader title="Comptabilité" description={`${church?.name ?? ""} · Année ${now.getFullYear()}`} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Budget total", value: fmtAmount(totalAmount), sub: `${active.length} demande${active.length > 1 ? "s" : ""}`, color: "text-brand-text" },
          { label: "Validé", value: fmtAmount(approvedAmount), sub: (() => { const n = requests.filter(r => r.status === "APPROVED").length; return `${n} demande${n > 1 ? "s" : ""}`; })(), color: "text-success" },
          { label: "En attente", value: fmtAmount(pendingAmount), sub: `${submittedCount + processingCount} en cours`, color: "text-warning" },
          { label: "Retards paiement", value: overduePayments.length.toString(), sub: overduePayments.length > 0 ? "à régulariser" : "Aucun retard", color: overduePayments.length > 0 ? "text-danger" : "text-ink-muted" },
        ].map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-1">
            <p className="text-xs text-ink-muted">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-ink-muted">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Retards */}
      {overduePayments.length > 0 && (
        <Alert tone="danger" title="Paiements en retard">
          <ul className="mt-1 flex flex-col">
            {overduePayments.slice(0, 5).map((p) => (
              <li key={p.id}>
                {canOpen(p.request) ? (
                  <Link
                    href={`/accounting/requests/${p.request.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-control text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="truncate">{p.request.label}</span>
                    <span className="flex shrink-0 items-center gap-1 font-medium">
                      {fmtAmount(Number(p.amount))}
                      <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    </span>
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center justify-between gap-3 text-sm text-ink">
                    <span className="truncate">{p.request.label}</span>
                    <span className="shrink-0 font-medium">{fmtAmount(Number(p.amount))}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Dernières demandes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[17px] font-semibold text-ink">Demandes {now.getFullYear()}</h2>
          <Link href="/accounting/requests" className={buttonClasses("ghost", "sm")}>
            Voir toutes les demandes
          </Link>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune demande cette année.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
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
                  <tr key={r.id} className="transition-colors hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      {canOpen(r) ? (
                        <Link href={`/accounting/requests/${r.id}`} className="inline-flex min-h-11 items-center gap-1 rounded-control font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0">
                          {r.label}
                          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{r.label}</span>
                      )}
                      <p className="text-xs text-ink-subtle mt-0.5">{fmt(r.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell">
                      {r.department?.name ?? <span className="text-ink-muted">Personnel</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell">{r.submittedBy.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{fmtAmount(Number(r.amount))}</td>
                    <td className="px-4 py-3">
                      <StatusChip tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </StatusChip>
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
