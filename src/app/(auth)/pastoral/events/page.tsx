import { redirect } from "next/navigation";
import { paths } from "@/lib/paths";

/** Spec 092, lot 3 : doublon retiré, le calendrier de l'église est ouvert au profil pastoral. L'adresse reste servie pour les liens mémorisés. */
export default function PastoralEventsRedirect() {
  redirect(paths.events());
}
