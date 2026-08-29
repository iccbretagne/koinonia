import { requireAudioAccess, requireChurchPermission } from "@/lib/auth";

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
