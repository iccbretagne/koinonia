import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import SpaceTabs from "@/components/SpaceTabs";
import { resolveMediaSpaceAccess, buildMediaSpaceTabs } from "@/lib/media-space";

/**
 * Espace « Communication & Production » à onglets à droits distincts (spec 043, sur le
 * modèle d'Audio — spec 021) — un seul lien de navigation, les onglets réellement affichés
 * dépendent de l'équipe/permissions de l'utilisateur. Le calcul se fait ici une fois ;
 * chaque page sous-jacente vérifie en plus ses propres droits.
 */
export default async function CommunicationLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const access = await resolveMediaSpaceAccess(session, churchId);
  const tabs = buildMediaSpaceTabs(access);

  return (
    <div>
      {tabs.length > 1 && <SpaceTabs tabs={tabs} ariaLabel="Onglets Communication & Production" />}
      {children}
    </div>
  );
}
