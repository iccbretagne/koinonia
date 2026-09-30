import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireCareQualify, getCareSettings, getCompanionSettings } from "@/modules/care";
import CareSettingsClient from "./CareSettingsClient";
import CompanionsSettings from "./CompanionsSettings";

export default async function CareSettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  await requireCareQualify(churchId);

  const [settings, companions] = await Promise.all([
    getCareSettings(churchId),
    getCompanionSettings(churchId),
  ]);

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-2">Suivi pastoral — Paramètres</h1>
        <p className="text-sm text-ink-muted mb-6">
          Délais au-delà desquels une demande est signalée à relancer : non confiée (aux Référents
          soins pastoraux), ou confiée sans suite — rendez-vous sans date fixée, suivi de nouveau
          converti sans premier contact (au référent en charge).
        </p>
        <CareSettingsClient churchId={churchId} settings={settings} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink mb-2">Accompagnants</h2>
        <p className="text-sm text-ink-muted mb-4">
          Les membres du MSDP sont accompagnants par défaut : décochez pour en écarter un. Un STAR
          d&apos;un autre département peut aussi être ajouté nominativement.
        </p>
        <CompanionsSettings churchId={churchId} initial={companions} />
      </div>
    </div>
  );
}
