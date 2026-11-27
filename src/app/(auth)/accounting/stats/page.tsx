import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { computeAccountingStats } from "@/modules/accounting";
import { PageHeader } from "@/components/ui";
import AccountingStats from "./AccountingStats";

export default async function AccountingStatsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  try {
    await requireChurchPermission("accounting:stats", churchId);
  } catch {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const initialData = await computeAccountingStats(churchId, "year");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Comptabilité" description="Vue d'ensemble des demandes et paiements" />
      <AccountingStats initialData={initialData} churchId={churchId} />
    </div>
  );
}
