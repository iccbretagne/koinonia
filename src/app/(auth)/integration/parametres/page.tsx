import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireIntegrationSettingsAccess, getIntegrationSettings } from "@/modules/integration";
import IntegrationSettingsClient from "./IntegrationSettingsClient";

export default async function IntegrationSettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;
  await requireIntegrationSettingsAccess(churchId);

  const settings = await getIntegrationSettings(churchId);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Intégration — Paramètres</h1>
      <p className="text-sm text-gray-500 mb-6">
        Délais au-delà desquels une demande en attente est signalée à toute l&apos;équipe
        intégration comme à relancer. Consigner une relance remet le décompte à zéro.
      </p>
      <IntegrationSettingsClient churchId={churchId} settings={settings} />
    </div>
  );
}
