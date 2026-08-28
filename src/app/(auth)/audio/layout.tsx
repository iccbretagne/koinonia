import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import AudioTabs from "./AudioTabs";
import { getAccessibleAudioTabs } from "./tabs";

/**
 * Espace « Audio » à onglets à droits distincts (spec 021) — un seul lien de navigation,
 * les onglets réellement affichés dépendent des permissions de l'utilisateur pour l'église
 * courante. Le calcul se fait ici une fois ; chaque page sous-jacente vérifie en plus ses
 * propres droits (l'onglet masqué ne dispense pas du contrôle serveur, cf. plan.md).
 */
export default async function AudioLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const tabs = await getAccessibleAudioTabs(churchId);

  return (
    <div>
      {tabs.length > 1 && <AudioTabs tabs={tabs} />}
      {children}
    </div>
  );
}
