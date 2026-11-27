import { redirect, notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import SpaceHome from "@/components/SpaceHome";
import { getAudioSpaceCards } from "./tabs";

/** Accueil de l'espace Audio (spec 049) : une carte par activité, redirection si une seule. */
export default async function AudioIndexPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const cards = await getAudioSpaceCards(churchId);
  if (cards.length === 0) notFound();
  if (cards.length === 1) redirect(cards[0].href);

  return <SpaceHome title="Audio" cards={cards} />;
}
