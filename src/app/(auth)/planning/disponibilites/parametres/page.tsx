import Link from "next/link";
import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { getAvailabilitySettings } from "@/modules/planning";
import AvailabilitySettingsClient from "./AvailabilitySettingsClient";
import PageHeader from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/button-classes";
import { paths } from "@/lib/paths";

export default async function AvailabilitySettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("availability:settings", churchId);
  const settings = await getAvailabilitySettings(churchId);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader
        title="Réglages de la collecte"
        description="Chaque mois, tous les STAR sont invités à indiquer leurs disponibilités. La collecte s'ouvre automatiquement, même tardivement si le calendrier a été publié tard."
        actions={
          <Link href={paths.disponibilites.collectes()} className={buttonClasses("secondary")}>
            Voir les collectes
          </Link>
        }
      />
      <AvailabilitySettingsClient churchId={churchId} settings={settings} />
    </div>
  );
}
