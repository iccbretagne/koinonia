import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import Link from "next/link";
import WelcomeDutyShell from "./WelcomeDutyShell";

export default async function WelcomeDutyPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-sm text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("events:manage", churchId);

  return (
    <div>
      <div className="mb-2">
        <Link href="/admin" className="text-xs text-ink-subtle hover:text-ink-muted">
          ← Administration
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-ink mb-1">Service d&apos;accueil</h1>
      <p className="text-sm text-ink-muted mb-6">
        Gérez le pool de familles en rotation et leurs affectations aux événements.
      </p>
      <WelcomeDutyShell churchId={churchId} />
    </div>
  );
}
