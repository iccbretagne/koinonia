import Link from "next/link";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { getServingSettings } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import ServingSettingsForm from "./ServingSettingsForm";

/** Réglages des candidatures (spec 073) : Super Admin, Admin, responsable du PVS. */
export default async function CandidaturesParametresPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;
  const actor = await requireServingActor(churchId);
  if (!actor.canEditSettings) {
    return <EmptyState title="Accès refusé" description="Ces réglages sont réservés à l'administration et au responsable du PVS." />;
  }
  const settings = await getServingSettings(churchId, actor.pvsDeptIds);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href="/candidatures" className="text-sm text-ink-subtle hover:text-brand-text">
        ← Candidatures
      </Link>
      <PageHeader title="Paramètres des candidatures" />
      <ServingSettingsForm churchId={churchId} initial={settings} />
    </div>
  );
}
