import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import WelcomeDutyShell from "./WelcomeDutyShell";
import { PageHeader } from "@/components/ui";

export default async function WelcomeDutyPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("events:manage", churchId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Service d'accueil"
        description="Gérez le pool de familles en rotation et leurs affectations aux événements."
      />
      <WelcomeDutyShell churchId={churchId} />
    </div>
  );
}
