import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { getAvailabilitySettings, listCollectionMonths } from "@/modules/planning";
import CollectionsPanel from "./CollectionsPanel";
import AvailabilitySettingsClient from "./AvailabilitySettingsClient";

export default async function AvailabilitySettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("availability:settings", churchId);
  const [settings, months] = await Promise.all([getAvailabilitySettings(churchId), listCollectionMonths(churchId)]);

  return (
    <div className="max-w-xl space-y-8">
      <div>
      <h1 className="text-2xl font-bold text-ink mb-2">Collecte des disponibilités — Paramètres</h1>
      <p className="text-sm text-ink-muted mb-6">
        Chaque mois, tous les STAR sont invités à indiquer leurs disponibilités. La collecte s&apos;ouvre
        automatiquement, même tardivement si le calendrier a été publié tard.
      </p>
      <AvailabilitySettingsClient churchId={churchId} settings={settings} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink mb-2">Collectes par mois</h2>
        <p className="text-sm text-ink-muted mb-4">
          Ouvrez à l&apos;avance la collecte d&apos;un mois sans attendre l&apos;ouverture automatique : les STAR
          concernés sont notifiés immédiatement.
        </p>
        <CollectionsPanel
          churchId={churchId}
          months={months.map((m) => ({
            month: m.month.toISOString().slice(0, 7),
            eventCount: m.eventCount,
            open: m.open,
            closesAt: m.closesAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}
