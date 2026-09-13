import { requireChurchPermission } from "@/lib/auth";
import { requireAudioAccess } from "@/modules/audio/auth";
import { prisma } from "@/lib/prisma";
import type { SpaceCard } from "@/lib/media-space";

export interface AudioTab {
  href: string;
  label: string;
}

/**
 * Onglets de l'espace Audio réellement accessibles à l'utilisateur pour l'église courante
 * (spec 021) — partagé entre le layout (affichage) et `/audio` (redirection vers le premier
 * onglet accessible).
 */
export async function getAccessibleAudioTabs(churchId: string): Promise<AudioTab[]> {
  const canListen = await hasAccess(() => requireChurchPermission("audio:listen", churchId));
  const canProduce = await hasAccess(() => requireAudioAccess("audio:view", churchId));
  const canManage = await hasAccess(() => requireAudioAccess("audio:manage", churchId));

  return [
    canListen && { href: "/audio/ecouter", label: "(re)Écouter" },
    canProduce && { href: "/audio/production", label: "Production" },
    canManage && { href: "/audio/parametres", label: "Paramètres" },
  ].filter((t): t is AudioTab => Boolean(t));
}

async function hasAccess(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch {
    return false;
  }
}

/**
 * Cartes de l'accueil de l'espace Audio (spec 049, même pattern que Communication &
 * Production) — filtrées par droit, avec un compteur pour (re)Écouter et Production.
 */
export async function getAudioSpaceCards(churchId: string): Promise<SpaceCard[]> {
  const canListen = await hasAccess(() => requireChurchPermission("audio:listen", churchId));
  const canProduce = await hasAccess(() => requireAudioAccess("audio:view", churchId));
  const canManage = await hasAccess(() => requireAudioAccess("audio:manage", churchId));

  const cards: SpaceCard[] = [];

  if (canListen) {
    const publishedCount = await prisma.audioService.count({
      where: {
        churchId,
        status: "PUBLISHED",
        publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });
    cards.push({ href: "/audio/ecouter", title: "(re)Écouter", stats: [`${publishedCount} publié(s) (30 j)`] });
  }

  if (canProduce) {
    const pendingCount = await prisma.audioService.count({
      where: { churchId, status: { in: ["DRAFT", "PENDING_REVIEW"] } },
    });
    cards.push({ href: "/audio/production", title: "Production", stats: [`${pendingCount} en attente`] });
  }

  if (canManage) {
    cards.push({ href: "/audio/parametres", title: "Paramètres" });
  }

  return cards;
}
