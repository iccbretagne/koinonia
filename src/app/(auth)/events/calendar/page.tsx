import { redirect } from "next/navigation";
import { paths } from "@/lib/paths";

/**
 * La vue calendrier a été fusionnée dans « Agenda de l'église » (/events), où elle n'est plus
 * qu'un mode d'affichage. On garde la route pour les liens et favoris existants.
 */
export default function CalendarPage() {
  redirect(paths.events());
}
