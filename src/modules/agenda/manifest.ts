import { defineModule } from "@/core/module-registry";

/**
 * Module agenda — Agenda pastoral.
 *
 * Périmètre :
 *   - Profils pastoraux (Pasteur, Berger, Assistante)
 *   - Planification et saisie directe des entrées agenda (Protocole)
 *   - Vue agenda hebdomadaire par profil pastoral
 *
 * Dépendances : core (obligatoire)
 *
 * La qualification et l'affectation des demandes de RDV appartiennent au module `care`
 * (ADR-0015, spec 052) — `agenda` ne porte plus `agenda:qualify`. `agenda:manage` reste ici :
 * le protocole planifie toujours dans l'agenda, via une route orchestratrice qui délègue à
 * `care` le passage de la demande à SCHEDULED.
 */
export const agendaModule = defineModule({
  name: "agenda",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/agenda" }],
    api: [{ path: "/api/agenda" }],
    // Le formulaire public (/agenda-public) et sa route de soumission appartiennent à `care`
    // depuis la spec 052 (ADR-0015) — adresse historique conservée, module propriétaire changé.
  },

  permissions: {
    // Vue lecture : rôles admin + Protocole (dept function) + profil pastoral lié (vérifié dans les routes)
    "agenda:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Saisie directe + planification des demandes validées (+ Protocole via dept function)
    "agenda:manage":  ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },

  navigation: [
    { label: "Agenda",    icon: "calendar", href: "/agenda",          permission: "agenda:manage" },
    { label: "Planifier", icon: "clock",    href: "/agenda/schedule", permission: "agenda:manage" },
  ],
});
