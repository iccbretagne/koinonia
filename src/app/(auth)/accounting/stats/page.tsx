import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { computeAccountingStats } from "@/modules/accounting";
import AccountingStats from "./AccountingStats";
import { isShuttleVisible } from "@/modules/shuttle/auth";
import { isTreasuryVisible } from "@/modules/treasury/auth";
import AccountingNav from "../AccountingNav";

export default async function AccountingStatsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  try {
    await requireChurchPermission("accounting:stats", churchId);
  } catch {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const [initialData, canViewShuttle, canViewTreasury] = await Promise.all([
    computeAccountingStats(churchId, "year"),
    isShuttleVisible(session, churchId),
    isTreasuryVisible(session, churchId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Comptabilité</h1>
        <p className="text-sm text-ink-muted mt-0.5">Vue d&apos;ensemble des demandes et paiements</p>
      </div>
      <AccountingNav canViewStats canViewShuttle={canViewShuttle} canViewTreasury={canViewTreasury} active="stats" />
      <AccountingStats initialData={initialData} churchId={churchId} />
    </div>
  );
}
