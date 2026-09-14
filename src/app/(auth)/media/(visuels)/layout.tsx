import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import SpaceTabs from "@/components/SpaceTabs";
import { resolveMediaSpaceAccess, buildVisualsTabs } from "@/lib/media-space";

/**
 * Onglets internes de l'activité Visuels (spec 049) : Projets (bibliothèque) et Demandes —
 * groupe de routes qui n'apparaît pas dans l'URL (`/media/projects`, `/media/requests`
 * inchangées). Chaque page vérifie en plus ses propres droits.
 */
export default async function VisuelsLayout({ children }: { readonly children: React.ReactNode }) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const access = await resolveMediaSpaceAccess(session, churchId);
  const tabs = buildVisualsTabs(access);

  return (
    <div>
      {tabs.length > 1 && <SpaceTabs tabs={tabs} ariaLabel="Onglets Visuels" />}
      {children}
    </div>
  );
}
