import { redirect } from "next/navigation";

/**
 * La vue calendrier a été fusionnée dans « Agenda de l'église » (/events), où elle n'est plus
 * qu'un mode d'affichage. On garde la route pour les liens et favoris existants.
 */
export default function CalendarPage() {
  redirect("/events");
}
