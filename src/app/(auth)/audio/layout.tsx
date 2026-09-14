import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import SpaceBreadcrumb from "@/components/SpaceBreadcrumb";

/**
 * Espace « Audio » (spec 049) : l'accueil (`/audio`) affiche les cartes d'activité, ce layout
 * ne porte plus qu'un fil d'Ariane de retour — chaque page vérifie ses propres droits.
 */
export default async function AudioLayout({ children }: { readonly children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  return (
    <div>
      <SpaceBreadcrumb homeHref="/audio" label="Audio" />
      {children}
    </div>
  );
}
