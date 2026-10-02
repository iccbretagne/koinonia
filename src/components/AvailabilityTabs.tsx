import Tabs from "@/components/ui/Tabs";

/** Onglets entre « Mes disponibilités » et la vue d'ensemble du périmètre (spec 058). */
export default function AvailabilityTabs() {
  return (
    <Tabs
      ariaLabel="Disponibilités"
      tabs={[
        { href: "/disponibilites", label: "Mes disponibilités", exact: true },
        { href: "/absences", label: "Indisponibilités de l'équipe" },
      ]}
    />
  );
}
