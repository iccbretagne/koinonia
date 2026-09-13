import { redirect } from "next/navigation";

// La modération est désormais intégrée à l'écran « Offres » (spec 048) : les actions
// publier/retirer et le filtre de statut y sont accessibles pour `jobs:manage`, sur les 4
// catégories. Cette page ne subsiste que pour rediriger un ancien lien ou favori.
export default function AdminJobsRedirect() {
  redirect("/jobs");
}
