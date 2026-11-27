import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireCareQualify, getCareSettings, getCompanionSettings } from "@/modules/care";
import CareSettingsClient from "./CareSettingsClient";
import CompanionsSettings from "./CompanionsSettings";
import { PageHeader } from "@/components/ui";

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
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <PageHeader
          className="mb-6"
          eyebrow="Suivi pastoral"
          title="Paramètres"
          description="Délais au-delà desquels une demande est signalée à relancer : non confiée (aux Référents soins pastoraux), ou confiée sans suite — rendez-vous sans date fixée, suivi de nouveau converti sans premier contact (au référent en charge)."
        />
        <CareSettingsClient churchId={churchId} settings={settings} />
      </div>
      <section>
        <h2 className="mb-2 font-display text-[17px] font-semibold text-ink">Accompagnants</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Les membres du MSDP sont accompagnants par défaut : décochez pour en écarter un. Un STAR
          d&apos;un autre département peut aussi être ajouté nominativement.
        </p>
        <CompanionsSettings churchId={churchId} initial={companions} />
      </section>
    </div>
  );
}
