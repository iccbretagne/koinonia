import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import SpaceBreadcrumb from "@/components/SpaceBreadcrumb";

/**
 * Espace « Communication & Production » (spec 049) : l'accueil (`/media`) affiche les cartes
 * d'activité, ce layout ne porte plus qu'un fil d'Ariane de retour — chaque page vérifie ses
 * propres droits (T4/T10).
 */
export default async function MediaLayout({ children }: { children: React.ReactNode }) {
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
