import { forbidden } from "next/navigation";
import { requireChurchPermission, requireSuperAdmin } from "@/lib/auth";
import { isForbiddenError } from "@/lib/forbidden";

/**
 * Garde d'adresse : un vrai HTTP 403 pour les écrans refusés.
 *
 * Presque chaque écran de `(auth)` est sous un `loading.tsx` : Next.js envoie l'en-tête (200) et
 * le squelette avant que la page ne s'exécute, si bien qu'un `forbidden()` dans la page ne peut
 * plus changer le statut (docs Next.js, `loading.js` › Status codes). Seul `(auth)/layout.tsx`
 * s'exécute avant le premier `loading.tsx` : il rejoue ici, pour l'adresse demandée, **la même
 * garde que la page** et appelle `forbidden()` si elle refuse — 403 et `src/app/forbidden.tsx`.
 *
 * Règles :
 * - une entrée = une adresse exacte (jamais un préfixe) et l'appel que sa `page.tsx` fait en
 *   premier, sans condition, une fois l'église courante connue ; `page-gates.test.ts` vérifie
 *   que la page contient bien `call` mot pour mot ;
 * - la garde n'ajoute aucun refus : elle ne fait qu'avancer celui de la page, qui garde son
 *   propre contrôle (navigation côté client, refus objet par objet → `(auth)/forbidden.tsx`) ;
 * - toute autre erreur que FORBIDDEN est ignorée ici : la page la rencontrera et la traitera ;
 * - aucune adresse à identifiant : un objet absent doit rester un 404, jamais un 403.
 */

export interface GateContext {
  /** Église courante, calculée comme dans la page (`getCurrentChurchId`). */
  churchId: string | null;
  /** Vue pastorale affichée (`isPastoralView`), pour les pages qui redirigent avant leur garde. */
  pastoralView: boolean;
}

interface PageGate {
  /** Appel tel qu'écrit dans `page.tsx` (vérifié par le test). */
  call: string;
  check: (ctx: GateContext) => Promise<unknown>;
}

/** `requireChurchPermission(permission, churchId)` dans l'église courante. */
function permission(perm: string): PageGate {
  return {
    call: `requireChurchPermission("${perm}", churchId)`,
    check: async ({ churchId }) => churchId && requireChurchPermission(perm, churchId),
  };
}

/** Garde de module `name(churchId)` (ou `name("perm", churchId)`), chargée à la demande. */
function moduleGuard(call: string, run: (churchId: string) => Promise<unknown>): PageGate {
  return { call, check: async ({ churchId }) => churchId && run(churchId) };
}

const superAdmin: PageGate = { call: "requireSuperAdmin()", check: () => requireSuperAdmin() };

const audio = (perm: string) =>
  moduleGuard(`requireAudioAccess("${perm}", churchId)`, async (c) => (await import("@/modules/audio/auth")).requireAudioAccess(perm, c));
const agendaManage = moduleGuard("requireAgendaManage(churchId)", async (c) => (await import("@/modules/agenda/auth")).requireAgendaManage(c));
const servingActor = moduleGuard("requireServingActor(churchId)", async (c) => (await import("@/modules/serving/auth")).requireServingActor(c));
const integration = moduleGuard("requireIntegrationAccess(churchId)", async (c) => (await import("@/modules/integration/auth")).requireIntegrationAccess(c));

export const PAGE_GATES: Readonly<Record<string, PageGate>> = {
  // Administration de l'église
  "/admin/access": permission("access:manage"),
  "/admin/audit-logs": permission("church:settings"),
  "/admin/departments": permission("departments:manage"),
  "/admin/departments/functions": permission("events:manage"),
  "/admin/messages": permission("messages:publish"),
  "/admin/messages/nouveau": permission("messages:publish"),
  "/admin/ministries": permission("departments:manage"),
  "/admin/salles": permission("rooms:manage"),
  "/admin/users": permission("users:manage"),
  "/admin/users/nouveau": permission("users:manage"),
  // Demandes, événements
  "/demandes/nouvelle": permission("members:view"),
  "/evenements/annonces": permission("planning:view"),
  "/evenements/gestion": permission("events:manage"),
  "/evenements/service-accueil": permission("events:manage"),
  // Finances
  "/finances/dons": permission("giving:manage"),
  "/finances/dons/slide": permission("giving:manage"),
  "/finances/statistiques": permission("accounting:stats"),
  "/finances/navette": moduleGuard("requireShuttleAccess(churchId)", async (c) => (await import("@/modules/shuttle/auth")).requireShuttleAccess(c)),
  "/finances/tresorerie": moduleGuard("requireTreasuryAccess(churchId)", async (c) => (await import("@/modules/treasury/auth")).requireTreasuryAccess(c)),
  // Médias
  "/medias/audio/parametres": audio("audio:manage"),
  "/medias/audio/production": audio("audio:view"),
  // Pastoral
  "/pastoral/agenda": agendaManage,
  "/pastoral/agenda/nouveau": agendaManage,
  "/pastoral/planification": agendaManage,
  "/pastoral/suivi/parametres": moduleGuard("requireCareQualify(churchId)", async (c) => (await import("@/modules/care/auth")).requireCareQualify(c)),
  // Personnes
  "/personnes/candidatures": servingActor,
  "/personnes/candidatures/entretiens": servingActor,
  "/personnes/candidatures/parametres": servingActor,
  "/personnes/discipolat": permission("discipleship:view"),
  "/personnes/integration/bergers": integration,
  "/personnes/integration/dossiers": integration,
  "/personnes/integration/parcours": integration,
  "/personnes/integration/stats": integration,
  "/personnes/integration/parametres": moduleGuard(
    "requireIntegrationSettingsAccess(churchId)",
    async (c) => (await import("@/modules/integration/auth")).requireIntegrationSettingsAccess(c)
  ),
  "/personnes/star": permission("members:view"),
  "/personnes/star/doublons": permission("members:manage"),
  // Planning, ressources
  "/planning": permission("planning:view"),
  // La page renvoie la vue pastorale vers l'accueil avant sa garde : même ordre ici.
  "/planning/departements": {
    call: `requireChurchPermission("planning:department", currentChurchId)`,
    check: async ({ churchId, pastoralView }) => !pastoralView && churchId && requireChurchPermission("planning:department", churchId),
  },
  "/planning/disponibilites/collectes": permission("availability:settings"),
  "/planning/disponibilites/parametres": permission("availability:settings"),
  "/ressources/salles": permission("rooms:view"),
  // Plateforme (les écrans qui redirigent vers l'accueil gardent ce comportement)
  "/plateforme/assistant": superAdmin,
  "/plateforme/eglises": superAdmin,
  "/plateforme/eglises/nouvelle": superAdmin,
  "/plateforme/mcp": superAdmin,
};

/**
 * Rejoue la garde de l'adresse demandée avant le flux ; `forbidden()` (403) si elle refuse.
 * Sans adresse (en-tête absent) ou adresse sans entrée : ne fait rien.
 */
export async function enforcePageGate(pathname: string | null | undefined, ctx: GateContext): Promise<void> {
  const gate = pathname && Object.hasOwn(PAGE_GATES, pathname) ? PAGE_GATES[pathname] : undefined;
  if (!gate) return;
  try {
    await gate.check(ctx);
  } catch (error) {
    if (isForbiddenError(error)) forbidden();
  }
}
