import type { Role } from "@/generated/prisma/client";

/**
 * Source unique des libellés, descriptions et catégories de rôle — remplace les tables locales
 * recopiées dans `GuideContent.tsx`, `AccessClient.tsx`, `UsersClient.tsx`,
 * `LinkRequestsClient.tsx`, `NoAccessClient.tsx`, `RequestForm.tsx` (spec 054, critère « même
 * libellé partout »). Constantes pures : aucun import serveur, utilisables depuis un composant
 * client.
 */

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SECRETARY: "Secrétaire",
  MINISTER: "Ministre",
  DEPARTMENT_HEAD: "Responsable de département",
  DISCIPLE_MAKER: "Faiseur de disciples",
  REPORTER: "Reporter",
  STAR: "STAR",
  PASTORAL_CARE_REFERENT: "Référent soins pastoraux",
  ACCOUNTANT: "Comptable",
};

/** Libellé court, pour les tableaux étroits — identique à `ROLE_LABELS` sauf mention contraire. */
export const ROLE_SHORT_LABELS: Record<Role, string> = {
  ...ROLE_LABELS,
  DEPARTMENT_HEAD: "Resp. département",
  PASTORAL_CARE_REFERENT: "Référent",
};

/** Phrase affichée à l'attribution d'un rôle (spec 054, critère d'acceptation). */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: "Accès complet à toutes les églises de la plateforme.",
  ADMIN: "Gestion complète d'une église : planning, membres, événements, accès, discipolat, comptes rendus.",
  SECRETARY: "Vision globale en lecture, gestion des événements, des accès, du discipolat et des comptes rendus — bras droit de l'Admin.",
  MINISTER: "Gestion du planning et des membres pour les départements de son ministère ; attribue les rôles rattachables (Resp. département, STAR) dans son ministère.",
  DEPARTMENT_HEAD: "Gestion du planning et des membres pour ses départements assignés. Accès au discipolat.",
  DISCIPLE_MAKER: "Suivi de ses disciples et de leur lignée dans le discipolat.",
  REPORTER: "Saisie et consultation des comptes rendus d'événements et de leurs statistiques.",
  STAR: "Membre actif d'un département : planning personnel, absences, demandes internes.",
  PASTORAL_CARE_REFERENT: "Qualifie et affecte les demandes de rendez-vous pastoral et les suivis de nouveaux convertis.",
  ACCOUNTANT: "Traite les demandes financières (validation, rejet, saisie des paiements) et consulte les statistiques comptables.",
};

/** Regroupement pour la fiche personne et la vue par rôle (spec 054). */
export type RoleCategory = "administration" | "responsabilite" | "fonction" | "membre";

export const ROLE_CATEGORY: Record<Role, RoleCategory> = {
  SUPER_ADMIN: "administration",
  ADMIN: "administration",
  SECRETARY: "administration",
  MINISTER: "responsabilite",
  DEPARTMENT_HEAD: "responsabilite",
  DISCIPLE_MAKER: "fonction",
  REPORTER: "fonction",
  PASTORAL_CARE_REFERENT: "fonction",
  ACCOUNTANT: "fonction",
  STAR: "membre",
};

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  administration: "Administration de l'église",
  responsabilite: "Responsabilité sur un périmètre",
  fonction: "Fonction spécialisée",
  membre: "Membre",
};

/**
 * Rôles rattachables à un ministère ou un département — les seuls qu'un Ministre au périmètre
 * restreint peut attribuer/retirer (spec 031, issue #467 ; repris ici pour rester la seule
 * source, y compris pour la fiche personne et la vue par rôle de la spec 054).
 */
export const ASSIGNABLE_BY_MINISTER: readonly Role[] = ["MINISTER", "DEPARTMENT_HEAD", "STAR"];

/** Rôles réservés au Super Admin (`PRIVILEGED_ROLES` de la route des rôles). */
export const PRIVILEGED_ROLES: readonly Role[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];

export const ALL_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
  "STAR",
  "PASTORAL_CARE_REFERENT",
  "ACCOUNTANT",
];
