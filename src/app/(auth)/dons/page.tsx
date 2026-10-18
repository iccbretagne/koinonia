import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { getGivingSettings } from "@/modules/giving";
import { PageHeader } from "@/components/ui";
import GivingSettingsClient from "./GivingSettingsClient";

export default async function GivingSettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  try {
    await requireChurchPermission("giving:manage", churchId);
  } catch {
    return <p className="p-4 text-ink-muted">Accès non autorisé.</p>;
  }

  const settings = await getGivingSettings(churchId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Page de dons"
        description="La page publique où chacun trouve comment donner, et la slide projetée au culte."
      />
      <GivingSettingsClient settings={settings} />
    </div>
  );
}
