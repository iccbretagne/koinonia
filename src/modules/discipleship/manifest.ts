import { defineModule } from "@/core/module-registry";

/**
 * Module discipleship — ex-Koinonia (discipolat).
 *
 * Périmètre :
 *   - Relations disciple / faiseur de disciples
 *   - Présences aux rencontres (DiscipleshipAttendance)
 *   - Export statistiques
 *
 * Dépendances : core (obligatoire), planning (obligatoire — lie les disciples aux membres)
 */
export const discipleshipModule = defineModule({
  name: "discipleship",
  version: "1.0.0",
  dependsOn: ["core", "planning"],

  permissions: {
    "discipleship:view":   ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER"],
    "discipleship:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "DISCIPLE_MAKER"],
    "discipleship:export": ["SUPER_ADMIN", "SECRETARY"],
  },

  navigation: [
    { label: "Discipolat", icon: "discipleship", href: "/admin/discipleship", permission: "discipleship:view" },
  ],
});
