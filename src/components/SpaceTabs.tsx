import Tabs, { type TabItem } from "@/components/ui/Tabs";

/**
 * Barre d'onglets d'un espace à droits distincts (Audio, spec 021 ; Communication & Production,
 * spec 043) — un seul lien de navigation, les onglets réellement affichés dépendent des
 * permissions de l'utilisateur, calculées une fois par le layout. Repose sur `Tabs`
 * (docs/design-system/components/Tabs.md) : défilement horizontal sur mobile, collée sous la
 * barre supérieure (`--k-sticky-top`, posée par `AuthLayoutShell`, tient compte du bandeau de
 * recette).
 */
export default function SpaceTabs({ tabs, ariaLabel }: { readonly tabs: readonly TabItem[]; readonly ariaLabel: string }) {
  return (
    <Tabs
      tabs={tabs}
      ariaLabel={ariaLabel}
      className="sticky top-[var(--k-sticky-top,56px)] z-20 -mx-4 mb-6 bg-bg px-4 md:-mx-6 md:px-6"
    />
  );
}
