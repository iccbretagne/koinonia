import { Tabs } from "@/components/ui";
import { paths } from "@/lib/paths";

/**
 * Barre d'onglets de « Mes inscriptions » (spec 092) : réservations de billetterie et réponses à
 * des formulaires. Affichée seulement quand la personne a les deux.
 */
export default function MyRegistrationsTabs({
  reservations,
  responses,
  active,
}: {
  readonly reservations: number;
  readonly responses: number;
  readonly active: "reservations" | "responses";
}) {
  if (reservations === 0 || responses === 0) return null;
  return (
    <Tabs
      ariaLabel="Mes inscriptions"
      tabs={[
        { href: paths.events.mesInscriptions(), label: "Réservations", count: reservations, active: active === "reservations" },
        { href: paths.events.mesInscriptions({ vue: "formulaires" }), label: "Réponses", count: responses, active: active === "responses" },
      ]}
    />
  );
}
