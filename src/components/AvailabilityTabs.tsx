import Tabs, { type TabItem } from "@/components/ui/Tabs";
import { paths } from "@/lib/paths";

/**
 * Onglets de l'espace Disponibilités (spec 058) : chacun n'apparaît qu'avec son droit, et la barre
 * n'est affichée que s'il y a au moins deux onglets. Chaque page vérifie son droit côté serveur.
 */
export default function AvailabilityTabs({
  self,
  team,
  collections,
}: {
  /** Compte lié à une fiche STAR. */
  readonly self: boolean;
  /** `absences:view`. */
  readonly team: boolean;
  /** `availability:settings`. */
  readonly collections: boolean;
}) {
  const tabs: TabItem[] = [];
  if (self) tabs.push({ href: paths.disponibilites(), label: "Mes disponibilités", exact: true });
  if (team) tabs.push({ href: paths.absences(), label: "Indisponibilités de l'équipe" });
  if (collections) tabs.push({ href: paths.disponibilites.collectes(), label: "Collectes" });
  if (tabs.length < 2) return null;
  return <Tabs ariaLabel="Disponibilités" tabs={tabs} />;
}
