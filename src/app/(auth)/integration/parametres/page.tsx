import { PageHeader } from "@/components/ui";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireIntegrationSettingsAccess, getIntegrationSettings } from "@/modules/integration";
import IntegrationSettingsClient from "./IntegrationSettingsClient";

export default async function IntegrationSettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  await requireIntegrationSettingsAccess(churchId);

  const settings = await getIntegrationSettings(churchId);

  return (
    <div className="max-w-xl">
      <PageHeader
        className="mb-6"
        eyebrow="Intégration"
        title="Paramètres"
        description="Délais au-delà desquels une demande en attente est signalée à toute l'équipe intégration comme à relancer. Consigner une relance remet le décompte à zéro."
      />
      <IntegrationSettingsClient churchId={churchId} settings={settings} />
    </div>
  );
}
