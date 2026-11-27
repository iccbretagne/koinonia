import { forbidden } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { PageHeader, buttonClasses } from "@/components/ui";
import { getServingSettings } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import ServingSettingsForm from "./ServingSettingsForm";
import { paths } from "@/lib/paths";

/** Réglages des candidatures (spec 077) : Super Admin, Admin, équipe PVS. */
export default async function CandidaturesParametresPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const actor = await requireServingActor(churchId);
  if (!actor.canEditSettings) {
    forbidden();
  }
  const settings = await getServingSettings(churchId, actor.pvsDeptIds);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={paths.candidatures()} className={`${buttonClasses("ghost", "sm")} self-start`}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Retour aux candidatures
      </Link>
      <PageHeader title="Paramètres des candidatures" />
      <ServingSettingsForm churchId={churchId} initial={settings} />
    </div>
  );
}
