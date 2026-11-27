import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { buildSpaces, landingHref, type SpaceKey } from "@/lib/navigation";
import { loadNavigationInput } from "@/lib/navigation-input";
import { paths } from "@/lib/paths";
import { isPastoralView } from "@/lib/view-mode";

/**
 * Racine d'espace (spec 092, lot 4) : `/finances`, `/personnes`, `/pastoral`, `/ressources`,
 * `/plateforme`, `/admin`. Une page sans contenu, déclarée dans `NOYAU_ROUTES`, qui envoie vers
 * la première page de l'espace **dans la navigation de la personne** (même calcul que la barre
 * latérale), sinon vers l'Accueil. Elle ne décide d'aucun droit : la page d'arrivée garde sa garde.
 */
export async function redirectToSpace(key: SpaceKey, root: string): Promise<never> {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  const pastoralChurchIds = session.user.pastoralChurchIds ?? [];
  const isPastoral = churchId ? pastoralChurchIds.includes(churchId) : pastoralChurchIds.length > 0;
  const hasClassicRole = session.user.churchRoles.some((r) => r.churchId === churchId);
  const viewModeCookie = (await cookies()).get("koinonia-view-mode")?.value;
  const inPastoralView = isPastoralView({ isPastoral, hasClassicRole, viewModeCookie });

  const { nav, canAccessDashboard, hasStarPlanning } = await loadNavigationInput(session, churchId, isPastoral);
  const spaces = buildSpaces({
    ...nav,
    homeHref: landingHref({ isPastoral: inPastoralView, hasPlanningAccess: canAccessDashboard, hasStarPlanning }),
    isPastoral: inPastoralView,
  });
  const target = spaces.find((s) => s.key === key);
  // Jamais de boucle vers la racine elle-même, jamais un lien externe.
  const href = target && !target.external && target.href !== root ? target.href : paths.accueil();
  redirect(href);
}
