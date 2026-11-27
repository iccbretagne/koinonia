import { redirect } from "next/navigation";
import { paths } from "@/lib/paths";

/** Spec 092, lot 3 : doublon retiré, les demandes comptables communes sont lisibles par le profil pastoral (lecture seule). L'adresse reste servie pour les liens mémorisés. */
export default function PastoralAccountingRedirect() {
  redirect(paths.accounting.requests());
}
