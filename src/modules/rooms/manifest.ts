import { defineModule } from "@/core/module-registry";

/**
 * Module rooms — réservation de salles et main courante.
 *
 * Périmètre :
 *   - Référentiel des salles et partage cross-église (liste blanche `RoomAccess`)
 *   - Réservations (avec récurrence propre ou alignée sur un événement récurrent)
 *   - Main courante (`RoomChecklist`) : déclaration ouverture/fermeture + contrôle
 *     indépendant par une équipe dédiée (fonction de département SECURITE/ENTRETIEN)
 *
 * Dépendances : core (obligatoire). Le lien optionnel vers `Event` (module `planning`)
 * est une relation Prisma au niveau schéma uniquement — aucun import TypeScript
 * cross-module requis.
 */
export const roomsModule = defineModule({
  name: "rooms",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/rooms" }, { path: "/admin/rooms" }],
    api: [{ path: "/api/rooms" }, { path: "/api/room-reservations" }],
  },

  permissions: {
    // STAR retiré : réservation de salle réservée aux responsables (spec 031, issue #463)
    "rooms:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "rooms:reserve": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "rooms:manage":  ["SUPER_ADMIN", "ADMIN"],
  },

  // Domaine de notification (spec 053) : un écart constaté au contrôle de la main courante, à
  // traiter par le créateur de la réservation — email activé par défaut (audit notifications).
  // `visibleWith` inclut `rooms:reserve` : le destinataire est le créateur de la réservation,
  // pas seulement un détenteur de `rooms:manage`.
  notificationDomains: [
    {
      key: "rooms",
      label: "Salles",
      description: "Écart constaté sur une salle que vous avez réservée.",
      defaultEmail: true,
      visibleWith: ["rooms:reserve", "rooms:manage"],
    },
  ],

  navigation: [
    { label: "Salles", icon: "rooms", href: "/rooms", permission: "rooms:view" },
  ],
});
