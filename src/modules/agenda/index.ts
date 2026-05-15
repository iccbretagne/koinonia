import { defineModule } from "@/core/module-registry";

/**
 * Module agenda — Agenda pastoral.
 *
 * Périmètre :
 *   - Profils pastoraux (Pasteur, Berger, Assistante)
 *   - Demandes de RDV (STAR connecté ou externe)
 *   - Qualification des demandes (Qualificateur désigné)
 *   - Planification et saisie directe des entrées agenda (Protocole)
 *   - Vue agenda hebdomadaire par profil pastoral
 *
 * Dépendances : core (obligatoire)
 *
 * Visibilité des demandes par rôle :
 *   - PENDING  → Qualificateur uniquement (agenda:qualify)
 *   - VALIDATED → Protocole uniquement (agenda:manage + dept function PROTOCOLE)
 *   - Les routes API enforceront ce filtrage strictement.
 */
export const agendaModule = defineModule({
  name: "agenda",
  version: "1.0.0",
  dependsOn: ["core"],

  permissions: {
    // Vue lecture : rôles admin + Protocole (dept function) + profil pastoral lié (vérifié dans les routes)
    // AGENDA_QUALIFIER n'a PAS agenda:view — il ne voit que les demandes PENDING via agenda:qualify
    "agenda:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Saisie directe + planification des demandes validées (+ Protocole via dept function)
    "agenda:manage":  ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Qualification des demandes brutes (PENDING)
    "agenda:qualify": ["SUPER_ADMIN", "ADMIN", "AGENDA_QUALIFIER"],
  },

  navigation: [
    { label: "Agenda",      icon: "calendar", href: "/agenda",          permission: "agenda:manage" },
    { label: "Qualifier",   icon: "inbox",    href: "/agenda/requests",  permission: "agenda:qualify" },
    { label: "Planifier",   icon: "clock",    href: "/agenda/schedule",  permission: "agenda:manage" },
    { label: "Prendre RDV", icon: "plus",     href: "/agenda/request",   permission: "planning:view" },
  ],
});
