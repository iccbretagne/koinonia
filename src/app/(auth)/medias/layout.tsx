import { requireAuth, getCurrentChurchId } from "@/lib/auth";

/**
 * Espace « Communication & Production » (spec 049) : l'accueil (`/media`) affiche les cartes
 * d'activité — chaque page vérifie ses propres droits (T4/T10). Le retour à l'accueil de l'espace
 * passe par le fil d'Ariane et le chevron de la barre supérieure (spec 055) ; ce layout ne fait
 * plus que le contrôle d'accès.
 */
export default async function MediaLayout({ children }: { readonly children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  return <>{children}</>;
}
