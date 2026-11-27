import { redirect } from "next/navigation";
import { paths } from "@/lib/paths";

/** Spec 092, lot 3 : doublon retiré, les comptes rendus communs sont lisibles par le profil pastoral (lecture seule). L'adresse reste servie pour les liens mémorisés. */
export default function PastoralReportsRedirect() {
  redirect(paths.admin.reports());
}
