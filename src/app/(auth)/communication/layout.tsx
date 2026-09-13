import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import SpaceBreadcrumb from "@/components/SpaceBreadcrumb";

/**
 * Sous-espace « Réseaux sociaux » de Communication & Production (spec 049) — même fil d'Ariane
 * de retour que `/media`, chaque page vérifie ses propres droits.
 */
export default async function CommunicationLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  return (
    <div>
      <SpaceBreadcrumb homeHref="/media" label="Communication & Production" />
      {children}
    </div>
  );
}
