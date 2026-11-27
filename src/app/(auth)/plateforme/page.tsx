import { redirectToSpace } from "@/lib/space-redirect";
import { paths } from "@/lib/paths";

/** Racine de l'espace (spec 092, lot 4) : première page accessible de l'espace, sinon l'Accueil. */
export default async function SpaceRoot() {
  return redirectToSpace("platform", paths.plateforme());
}
