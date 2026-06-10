import { defineModule } from "@/core/module-registry";

export const accountingModule = defineModule({
  name: "accounting",
  version: "1.0.0",
  dependsOn: ["core", "planning"],

  permissions: {
    // Soumettre une demande (resp. et co-resp. de département, admins)
    "accounting:submit":  ["SUPER_ADMIN", "ADMIN", "DEPARTMENT_HEAD"],
    // Consulter les demandes (compta = global, dept_head = son département)
    "accounting:view":    ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "DEPARTMENT_HEAD"],
    // Traiter les demandes (changer statut, valider, rejeter, saisir paiements)
    "accounting:manage":  ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  },

  navigation: [
    { label: "Comptabilité", icon: "accounting", href: "/accounting/requests", permission: "accounting:view" },
  ],
});
