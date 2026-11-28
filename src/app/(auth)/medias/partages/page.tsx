import { redirect } from "next/navigation";
import { paths } from "@/lib/paths";

/**
 * L'écran dédié « Collections » disparaît (spec 049) : le partage est désormais une action
 * depuis Photos/Visuels (« Partager une sélection ») et se consulte via le bouton « Partages »
 * de l'accueil. Redirection conservée pour les anciens liens/favoris.
 */
export default function CollectionsPage() {
  redirect(paths.media());
}
