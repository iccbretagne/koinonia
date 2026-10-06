import { redirect } from "next/navigation";
import { requireAuth, getCurrentChurchId, getMediaShareScope } from "@/lib/auth";
import { resolveMediaSpaceAccess, buildMediaSpaceCards, getMediaSpaceCounters } from "@/lib/media-space";
import { countActiveShares } from "@/modules/media";
import MediaHomeClient from "./MediaHomeClient";

function pendingStats(title: string, counters: Awaited<ReturnType<typeof getMediaSpaceCounters>>): string[] | undefined {
  let count: number | undefined;
  if (title === "Photos") count = counters.photos;
  else if (title === "Visuels") count = counters.visuals;
  else if (title === "Réseaux sociaux") count = counters.social;
  return count === undefined ? undefined : [`${count} en attente`];
}

/**
 * Accueil de l'espace « Communication & Production » (spec 049) : une carte par activité
 * accessible, redirection directe s'il n'y en a qu'une, bouton « Partages » si le périmètre
 * de l'utilisateur en donne au moins un.
 */
export default async function MediaIndexPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const access = await resolveMediaSpaceAccess(session, churchId);
  const counters = await getMediaSpaceCounters(churchId, access);
  const cards = buildMediaSpaceCards(access).map((card) => ({
    ...card,
    stats: pendingStats(card.title, counters),
  }));

  if (cards.length === 0) return <p>Aucun accès à cet espace.</p>;
  if (cards.length === 1) redirect(cards[0].href);

  const shareCount = access.share ? await countActiveShares(churchId, await getMediaShareScope(session, churchId)) : 0;

  return <MediaHomeClient cards={cards} showShareButton={access.share} shareCount={shareCount} />;
}
