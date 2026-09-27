import { requireAuth, getCurrentChurchId } from "@/lib/auth";

/**
 * Sous-espace « Réseaux sociaux » de Communication & Production (spec 049) — chaque page vérifie
 * ses propres droits. Le retour à l'accueil de l'espace passe par le fil d'Ariane et le chevron de
 * la barre supérieure (spec 055) ; ce layout ne fait plus que le contrôle d'accès.
 */
export default async function CommunicationLayout({ children }: { readonly children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  return <>{children}</>;
}
