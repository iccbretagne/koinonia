import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireCareQualify, getCareSettings } from "@/modules/care";
import CareSettingsClient from "./CareSettingsClient";

export default async function CareSettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;
  await requireCareQualify(churchId);

  const settings = await getCareSettings(churchId);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Suivi pastoral — Paramètres</h1>
      <p className="text-sm text-gray-500 mb-6">
        Délais au-delà desquels une demande est signalée à relancer : non confiée (aux Référents
        soins pastoraux), ou confiée sans suite — rendez-vous sans date fixée, suivi de nouveau
        converti sans premier contact (au référent ou au référent MSDP en charge).
      </p>
      <CareSettingsClient churchId={churchId} settings={settings} />
    </div>
  );
}
