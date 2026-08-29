import { defineModule } from "@/core/module-registry";

export {
  checkRoomAvailability,
  isRoomAuthorizedForChurch,
  createReservation,
  cancelReservation,
  generateRoomRecurrenceDates,
} from "./services/reservation.service";
export type { CreateReservationResult } from "./services/reservation.service";
export {
  declareOpening,
  declareClosing,
  validateChecklist,
  reportIssueWithoutDeclaration,
  closeWithoutDeclaration,
  isControlTeamMember,
} from "./services/checklist.service";

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

  permissions: {
    // STAR retiré : réservation de salle réservée aux responsables (spec 031, issue #463)
    "rooms:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "rooms:reserve": ["SUPER_ADMIN", "ADMIN", "MINISTER", "DEPARTMENT_HEAD"],
    "rooms:manage":  ["SUPER_ADMIN", "ADMIN"],
  },

  navigation: [
    { label: "Salles", icon: "rooms", href: "/rooms", permission: "rooms:view" },
  ],
});
