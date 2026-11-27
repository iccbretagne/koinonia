import { redirect } from "next/navigation";
import { paths } from "@/lib/paths";

/** Spec 092, lot 3 : le tableau pastoral est rendu par l'Accueil en vue pastorale. L'adresse reste servie pour les liens mémorisés. */
export default function PastoralRedirect() {
  redirect(paths.accueil());
}
