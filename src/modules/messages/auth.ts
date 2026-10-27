import { requireChurchPermission, requireSuperAdmin } from "@/lib/auth";

/**
 * Garde d'auteur des messages système (spec 071) : `messages:publish` dans l'église du message,
 * ou Super Admin pour un message d'instance (`churchId` nul). Pour un message existant,
 * `churchId` est celui du message, jamais l'église affichée.
 */
export async function requireMessageAuthorAccess(churchId: string | null) {
  if (churchId === null) return requireSuperAdmin();
  return requireChurchPermission("messages:publish", churchId);
}
