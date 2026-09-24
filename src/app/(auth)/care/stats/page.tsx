import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { getCareAccess, getCareStats } from "@/modules/care";
import CareStatsView from "./CareStatsView";

export default async function CareStatsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const access = await getCareAccess(session, churchId);
  if (!access.canOverview) {
    return <p className="p-4 text-gray-500">Accès non autorisé.</p>;
  }

  const stats = await getCareStats(churchId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Suivi pastoral — Statistiques</h1>
      <CareStatsView {...stats} />
    </div>
  );
}
