import Link from "next/link";
import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { getAvailabilitySettings } from "@/modules/planning";
import AvailabilitySettingsClient from "./AvailabilitySettingsClient";

export default async function AvailabilitySettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("availability:settings", churchId);
  const settings = await getAvailabilitySettings(churchId);

  return (
    <div className="max-w-xl">
      <Link href="/disponibilites/collectes" className="inline-flex min-h-11 items-center text-sm text-brand-text hover:underline">
        ← Collectes
      </Link>
      <h1 className="text-2xl font-bold text-ink mb-2">Réglages de la collecte</h1>
      <p className="text-sm text-ink-muted mb-6">
        Chaque mois, tous les STAR sont invités à indiquer leurs disponibilités. La collecte s&apos;ouvre
        automatiquement, même tardivement si le calendrier a été publié tard.
      </p>
      <AvailabilitySettingsClient churchId={churchId} settings={settings} />
    </div>
  );
}
