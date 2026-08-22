"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER" | "STAR" | "AGENDA_QUALIFIER" | "ACCOUNTANT";

interface GuideContentProps {
  defaultRole: RoleKey;
}

const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SECRETARY: "Secrétaire",
  MINISTER: "Ministre",
  DEPARTMENT_HEAD: "Resp. Département",
  DISCIPLE_MAKER: "Faiseur de Disciples",
  REPORTER: "Reporter (Comptes rendus)",
  STAR: "STAR (Membre)",
  AGENDA_QUALIFIER: "Qualificateur agenda",
  ACCOUNTANT: "Comptable",
};

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Accès complet à toutes les fonctionnalités et toutes les églises.",
  ADMIN: "Gestion complète d'une église : planning, membres, événements, discipolat et comptes rendus.",
  SECRETARY: "Vision globale en lecture avec gestion des événements, discipolat et comptes rendus.",
  MINISTER: "Gestion du planning et des membres pour les départements de son ministère.",
  DEPARTMENT_HEAD: "Gestion du planning et des membres pour ses départements assignés. Accès au discipolat.",
  DISCIPLE_MAKER: "Suivi des disciples et de leur arbre de lignée.",
  REPORTER: "Accès en lecture et écriture aux comptes rendus d'événements et statistiques.",
  STAR: "Membre actif (STAR) : consulte son planning personnel et celui de ses départements en lecture seule.",
  AGENDA_QUALIFIER: "Qualification des demandes de RDV pastoral : valide ou rejette, assigne au bon profil.",
  ACCOUNTANT: "Comptable : gestion des demandes financières (notes de frais, avances de budget), confirmation des paiements.",
};

type AccessLevel = "edit" | "read" | "none";

const GUIDE_ASSETS_BASE =
  "https://github.com/iccbretagne/koinonia/releases/download/guide-assets";

interface Feature {
  name: string;
  description: string;
  category: string;
  screenshotTitle: string;
  screenshotFile: string;
  access: Record<RoleKey, AccessLevel>;
}

const FEATURES: Feature[] = [
  // ── Planning ─────────────────────────────────────────────────────────────
  {
    name: "Voir le planning",
    description: "Grille de planning par département avec les STAR et leurs statuts de service (En service, Indisponible, Remplaçant…) pour chaque événement. Filtrable par département ou ministère.",
    category: "Planning",
    screenshotTitle: "Vue planning",
    screenshotFile: "guide-planning-view.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Modifier le planning",
    description: "Changez les statuts de service des STAR directement depuis la grille. Les modifications sont sauvegardées automatiquement (auto-save).",
    category: "Planning",
    screenshotTitle: "Édition du planning",
    screenshotFile: "guide-planning-edit.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Statistiques du planning",
    description: "Visualisez les taux de présence et de disponibilité par département sur une période donnée. Export Excel disponible.",
    category: "Planning",
    screenshotTitle: "Statistiques du planning",
    screenshotFile: "guide-planning-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Événements ───────────────────────────────────────────────────────────
  {
    name: "Voir les événements",
    description: "Liste et calendrier mensuel des événements planifiés. Filtrez par type (Culte, Concert, Réunion…).",
    category: "Événements",
    screenshotTitle: "Liste et calendrier des événements",
    screenshotFile: "guide-events-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "read", REPORTER: "read", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gérer les événements",
    description: "Créez, modifiez ou supprimez des événements. Activez le suivi de présence pour le discipolat sur les événements concernés.",
    category: "Événements",
    screenshotTitle: "Gestion des événements",
    screenshotFile: "guide-events-manage.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Comptes rendus",
    description: "Saisissez les comptes rendus d'événements : orateur, titre du message, statistiques de présence par département. Export Excel des statistiques sur une période choisie.",
    category: "Événements",
    screenshotTitle: "Comptes rendus d'événements",
    screenshotFile: "guide-reports.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "edit", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Membres ──────────────────────────────────────────────────────────────
  {
    name: "Voir les membres (STAR)",
    description: "Liste des STAR avec leurs départements, ministères et informations de contact. Filtrée automatiquement selon le périmètre du rôle (ministère ou département assigné).",
    category: "Membres",
    screenshotTitle: "Liste des STAR",
    screenshotFile: "guide-members-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gérer les membres (STAR)",
    description: "Ajoutez, modifiez ou supprimez des STAR. Gérez leurs affectations à des départements (principal ou secondaire).",
    category: "Membres",
    screenshotTitle: "Gestion des STAR",
    screenshotFile: "guide-members-manage.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Discipolat ───────────────────────────────────────────────────────────
  {
    name: "Relations de discipolat",
    description: "Gérez les liens FD ↔ disciple. Ajoutez un disciple (STAR existant ou nouveau membre), modifiez le FD ou le premier FD. Filtre \"Mes disciples\" disponible pour les admin/secrétaires liés à une fiche STAR.",
    category: "Discipolat",
    screenshotTitle: "Relations de discipolat",
    screenshotFile: "guide-discipleship-relations.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "edit", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Appel de présence",
    description: "Enregistrez la présence de vos disciples pour chaque événement de discipolat. Les Faiseurs de Disciples ne peuvent marquer que leurs propres disciples.",
    category: "Discipolat",
    screenshotTitle: "Appel de présence discipolat",
    screenshotFile: "guide-discipleship-appel.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "edit", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Statistiques & Export",
    description: "Visualisez les taux de présence par disciple sur une période. Export Excel de l'ensemble des relations et statistiques de l'église (réservé à Super Admin et Secrétaire).",
    category: "Discipolat",
    screenshotTitle: "Statistiques discipolat",
    screenshotFile: "guide-discipleship-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "read", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "read", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Annonces ─────────────────────────────────────────────────────────────
  {
    name: "Nouvelle demande",
    description: "Déposez une demande : diffusion d'annonce (interne, réseaux sociaux, visuel) depuis /requests/new. Renseignez le titre, le brief, la deadline et les canaux souhaités.",
    category: "Demandes",
    screenshotTitle: "Nouvelle demande",
    screenshotFile: "guide-requests-new.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Mes demandes",
    description: "Suivez l'état de toutes vos soumissions depuis /requests : En attente, En cours, Livrée, Refusée. L'annonce principale affiche le statut du visuel associé si demandé.",
    category: "Demandes",
    screenshotTitle: "Mes demandes",
    screenshotFile: "guide-requests-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gestion (Secrétariat)",
    description: "Vue centralisée de toutes les demandes de diffusion interne depuis /secretariat/requests. Marquez les annonces en cours, diffusées ou annulées. Visible pour les membres du département Secrétariat.",
    category: "Demandes",
    screenshotTitle: "Gestion des demandes — Secrétariat",
    screenshotFile: "guide-secretariat-dashboard.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Visuels (Prod. Média)",
    description: "Traitez les demandes de création de visuels depuis /media/requests. Mettez à jour le statut et partagez le lien de livraison. Visible pour les membres du département Production Média.",
    category: "Demandes",
    screenshotTitle: "Dashboard Production Média",
    screenshotFile: "guide-media-dashboard.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Communication",
    description: "Traitez les demandes de publication réseaux sociaux depuis /communication/requests. Confirmez la publication ou signalez un refus avec note. Visible pour les membres du département Communication.",
    category: "Demandes",
    screenshotTitle: "Dashboard Communication",
    screenshotFile: "guide-communication-dashboard.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Administration ────────────────────────────────────────────────────────
  {
    name: "Accès & rôles",
    description: "Attribuez les rôles (Ministre, Resp. Département, Secrétaire, FD, Reporter). Validez ou rejetez les demandes d'onboarding. Un responsable de département peut être désigné adjoint (isDeputy).",
    category: "Administration",
    screenshotTitle: "Accès & rôles",
    screenshotFile: "guide-access-roles.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Ministères & départements",
    description: "Créez et organisez les ministères et leurs départements. Configurez les fonctions système (Secrétariat, Communication, Production Média) et les fonctions personnalisées.",
    category: "Administration",
    screenshotTitle: "Gestion des ministères et départements",
    screenshotFile: "guide-admin-departments.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Paramètres de l'église",
    description: "Configurez le nom, l'email secrétariat (digest planning) et les paramètres généraux. Gestion multi-tenant pour les Super Admins.",
    category: "Administration",
    screenshotTitle: "Paramètres de l'église",
    screenshotFile: "guide-admin-church.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gestion des utilisateurs",
    description: "Consultez tous les comptes connectés. Gérez les accès globaux et la liaison entre comptes Google et fiches STAR.",
    category: "Administration",
    screenshotTitle: "Gestion des utilisateurs",
    screenshotFile: "guide-admin-users.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Journaux d'audit",
    description: "Historique complet et horodaté de toutes les modifications : qui a créé, modifié ou supprimé quoi. Filtrable par type d'entité et période.",
    category: "Administration",
    screenshotTitle: "Journaux d'audit",
    screenshotFile: "guide-admin-audit-logs.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Profil ────────────────────────────────────────────────────────────────
  {
    name: "Profil & liaison STAR",
    description: "Complétez votre profil et liez votre compte Google à votre fiche STAR. La liaison débloque les fonctionnalités avancées : filtre \"Mes disciples\", notifications personnalisées.",
    category: "Profil",
    screenshotTitle: "Profil et liaison STAR",
    screenshotFile: "guide-profile.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Salles ───────────────────────────────────────────────────────────────
  {
    name: "Réserver une salle",
    description: "Consultez le planning des salles et réservez un créneau depuis /rooms. La réservation est soumise à l'accord de l'équipe de contrôle si la salle le requiert.",
    category: "Salles",
    screenshotTitle: "Réservation de salles",
    screenshotFile: "guide-salles-reservation.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "edit", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Contrôle des mains courantes",
    description: "Validez l'état des lieux (ouverture/fermeture) des salles réservées depuis /rooms/checklists. Accessible aux gestionnaires de salles et, par appartenance de département, aux membres de l'équipe de contrôle — indépendamment du rôle global.",
    category: "Salles",
    screenshotTitle: "Contrôle des mains courantes",
    screenshotFile: "guide-salles-mains-courantes.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Agenda pastoral ──────────────────────────────────────────────────────
  {
    name: "Demande de RDV pastoral",
    description: "Déposez une demande de rendez-vous avec un pasteur ou responsable depuis /agenda/request. Disponible pour toute personne ayant accès au planning de son église.",
    category: "Agenda pastoral",
    screenshotTitle: "Demande de RDV pastoral",
    screenshotFile: "guide-agenda-demande.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "edit", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Qualification des demandes",
    description: "Examinez chaque demande de RDV depuis /agenda/requests : validez-la en l'assignant à un profil pastoral, ou rejetez-la avec un motif.",
    category: "Agenda pastoral",
    screenshotTitle: "Qualification des demandes de RDV",
    screenshotFile: "guide-agenda-qualification.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "edit", ACCOUNTANT: "none" },
  },
  {
    name: "Vue et planification agenda",
    description: "Consultez l'agenda hebdomadaire de chaque profil pastoral depuis /agenda, planifiez les créneaux des demandes validées depuis /agenda/schedule, ou ajoutez une entrée manuelle depuis /agenda/new. Un titulaire de profil pastoral voit également \"Mon agenda\", indépendamment de son rôle global.",
    category: "Agenda pastoral",
    screenshotTitle: "Vue et planification de l'agenda",
    screenshotFile: "guide-agenda-planification.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Comptabilité ─────────────────────────────────────────────────────────
  {
    name: "Soumettre une demande financière",
    description: "Déposez une note de frais ou une demande d'avance de budget depuis /accounting/requests/new. Un titulaire de profil pastoral peut également soumettre, indépendamment de son rôle global.",
    category: "Comptabilité",
    screenshotTitle: "Nouvelle demande financière",
    screenshotFile: "guide-comptabilite-demande.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Traiter les demandes financières",
    description: "Consultez et traitez les notes de frais et avances de budget depuis /accounting/requests : confirmez le paiement ou refusez avec un motif. Les Ministres et Resp. département voient leurs propres demandes en lecture seule.",
    category: "Comptabilité",
    screenshotTitle: "Gestion des demandes financières",
    screenshotFile: "guide-comptabilite-gestion.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "edit" },
  },
  {
    name: "Statistiques comptables",
    description: "Visualisez le total des demandes financières sur l'année en cours depuis /accounting/stats, par statut et par département.",
    category: "Comptabilité",
    screenshotTitle: "Statistiques comptables",
    screenshotFile: "guide-comptabilite-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "edit" },
  },

  // ── Emplois ──────────────────────────────────────────────────────────────
  {
    name: "Offres, recherches d'emploi & freelance",
    description: "Publiez ou consultez des offres d'emploi, des profils en recherche, et des missions freelance depuis /jobs (trois onglets). Fonctionnalité ouverte à tous les comptes de l'église.",
    category: "Emplois",
    screenshotTitle: "Offres et recherches d'emploi",
    screenshotFile: "guide-emplois-liste.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "edit", AGENDA_QUALIFIER: "edit", ACCOUNTANT: "edit" },
  },
  {
    name: "Modération des annonces",
    description: "Modérez et supprimez si besoin toute offre, recherche ou mission publiée par un autre compte, depuis /admin/jobs.",
    category: "Emplois",
    screenshotTitle: "Modération des annonces",
    screenshotFile: "guide-emplois-moderation.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },

  // ── Intégration ──────────────────────────────────────────────────────────
  {
    name: "Demandes d'intégration (familles)",
    description: "Suivez les demandes d'intégration de nouvelles familles depuis /integration/requests : assignez un berger, changez le statut. Accessible aussi, par appartenance de département (fonction Intégration) ou en tant que berger assigné, indépendamment du rôle global.",
    category: "Intégration",
    screenshotTitle: "Demandes d'intégration",
    screenshotFile: "guide-integration-demandes.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Suivi MSDP (appel au salut)",
    description: "Depuis la fiche d'une demande d'intégration, démarrez et suivez le parcours MSDP (Mieux Se Découvrir en Personne) : assignez un conseiller, faites progresser le statut, ajoutez des notes. Accessible au conseiller assigné et aux membres du département Intégration, indépendamment du rôle global.",
    category: "Intégration",
    screenshotTitle: "Suivi MSDP",
    screenshotFile: "guide-integration-msdp.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Bergers de famille",
    description: "Gérez la liste des bergers de famille et leurs affectations depuis /integration/leaders.",
    category: "Intégration",
    screenshotTitle: "Bergers de famille",
    screenshotFile: "guide-integration-bergers.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Parcours & statistiques d'intégration",
    description: "Consultez le parcours d'intégration type et les statistiques (délais, taux de complétion) depuis /integration/parcours et /integration/stats.",
    category: "Intégration",
    screenshotTitle: "Parcours et statistiques d'intégration",
    screenshotFile: "guide-integration-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", AGENDA_QUALIFIER: "none", ACCOUNTANT: "none" },
  },
];

const ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"];

function AccessBadge({ level }: { level: AccessLevel }) {
  switch (level) {
    case "edit":
      return <span className="inline-flex items-center text-sm text-green-700 bg-green-50 px-2 py-0.5 rounded-full">✓ Édition</span>;
    case "read":
      return <span className="inline-flex items-center text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">👁 Lecture</span>;
    case "none":
      return <span className="inline-flex items-center text-sm text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">✗ Pas d&apos;accès</span>;
  }
}

export default function GuideContent({ defaultRole }: GuideContentProps) {
  const [activeRole, setActiveRole] = useState<RoleKey>(defaultRole);
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const router = useRouter();

  const visibleFeatures = FEATURES.filter((f) => f.access[activeRole] !== "none");
  const categories = Array.from(new Set(visibleFeatures.map((f) => f.category)));

  return (
    <div>
      {/* Bouton tour guide interactif */}
      <div className="mb-6 flex items-center gap-3 p-4 bg-icc-violet/5 border border-icc-violet/20 rounded-lg">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-800">Decouvrir l&apos;interface</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Lancez un tour guide interactif pour decouvrir les fonctionnalites principales.
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard?tour=1")}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:bg-icc-violet/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Lancer le tour guide
        </button>
      </div>

      {/* Onglets par rôle */}
      <div className="flex overflow-x-auto gap-1 border-b border-gray-200 mb-6 pb-px -mx-1 px-1">
        {ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setActiveRole(role)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors shrink-0 ${
              activeRole === role
                ? "bg-icc-violet text-white"
                : "text-gray-600 hover:text-icc-violet hover:bg-gray-50"
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {/* Description du rôle */}
      <div className="mb-6 p-4 bg-icc-violet/5 border border-icc-violet/20 rounded-lg">
        <h2 className="text-lg font-semibold text-icc-violet">{ROLE_LABELS[activeRole]}</h2>
        <p className="text-sm text-gray-600 mt-1">{ROLE_DESCRIPTIONS[activeRole]}</p>
        {activeRole === "MINISTER" && (
          <p className="text-xs text-gray-500 mt-2 italic">
            * Le ministre a accès uniquement aux départements de son ministère assigné.
          </p>
        )}
        {activeRole === "SUPER_ADMIN" && (
          <p className="text-xs text-gray-500 mt-2 italic">
            * Les dashboards Secrétariat, Visuels et Communication sont visibles selon l&apos;appartenance au département concerné (fonction système).
          </p>
        )}
      </div>

      {/* Fonctionnalités par catégorie */}
      <div className="space-y-8">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="text-base font-semibold text-gray-800 mb-4 border-b pb-2">{category}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleFeatures.filter((f) => f.category === category).map((feature) => (
                <div key={feature.name} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-gray-700">{feature.name}</h4>
                    <AccessBadge level={feature.access[activeRole]} />
                  </div>
                  <p className="text-xs text-gray-500">{feature.description}</p>
                  <button
                    type="button"
                    onClick={() => setZoomedImage({ src: `${GUIDE_ASSETS_BASE}/${feature.screenshotFile}`, alt: feature.screenshotTitle })}
                    className="w-full aspect-video bg-gray-50 rounded-lg border border-gray-200 overflow-hidden cursor-zoom-in group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${GUIDE_ASSETS_BASE}/${feature.screenshotFile}`}
                      alt={feature.screenshotTitle}
                      className="w-full h-full object-contain transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Modale zoom image */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
            aria-label="Fermer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomedImage.src}
            alt={zoomedImage.alt}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
