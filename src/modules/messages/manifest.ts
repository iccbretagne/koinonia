import { defineModule } from "@/core/module-registry";

/**
 * Module messages — messages système de l'administration (spec 071).
 *
 * Périmètre :
 *   - Rédaction, programmation, correction et retrait d'un message par le Super Admin (toute
 *     l'instance ou une église), l'Admin et la Secrétaire (leur église)
 *   - Public décrit par critères (rôles, ministères, départements, responsables seulement),
 *     évalué à l'affichage et résolu au début de la période pour la notification
 *   - Bandeau en haut de l'application, reçus « vu » / « fermé », statistiques globales
 *   - Notification dans la cloche (domaine « Messages de l'administration ») ; un message
 *     urgent part par email malgré la préférence (ADR-0025)
 *
 * Dépendances : core (obligatoire).
 */
export const messagesModule = defineModule({
  name: "messages",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/admin/messages" }, { path: "/messages" }],
    api: [{ path: "/api/system-messages" }],
  },

  permissions: {
    // Publier un message système dans son église ; un message pour toute l'instance exige en
    // plus le Super Admin (requireMessageAuthorAccess).
    "messages:publish": ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },

  // Toujours visible (`visibleWith` omis) : n'importe quel compte peut faire partie d'un public.
  notificationDomains: [
    {
      key: "system-messages",
      label: "Messages de l'administration",
      description:
        "Maintenances, nouveautés et consignes publiées par l'administration de votre église ou de Koinonia.",
      defaultEmail: true,
    },
  ],
});
