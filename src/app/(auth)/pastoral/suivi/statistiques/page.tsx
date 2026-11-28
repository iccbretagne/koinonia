import { forbidden } from "next/navigation";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { getCareAccess, getCareStats } from "@/modules/care";
import { PageHeader } from "@/components/ui";
import CareStatsView from "./CareStatsView";

export default async function CareStatsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  const access = await getCareAccess(session, churchId);
  if (!access.canOverview) {
    forbidden();
  }

  const stats = await getCareStats(churchId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Suivi pastoral" title="Statistiques" />
      <CareStatsView {...stats} />
    </div>
  );
}
