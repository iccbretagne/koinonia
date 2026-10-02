"use client";

import { Ban, CirclePlay, Eye, Pencil } from "lucide-react";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ALL_ROLES } from "@/lib/roles";
import type { Role } from "@/generated/prisma/client";

type RoleKey = Role;

interface GuideContentProps {
  readonly defaultRole: RoleKey;
}

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
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Modifier le planning",
    description: "Changez les statuts de service des STAR directement depuis la grille. Les modifications sont sauvegardées automatiquement (auto-save).",
    category: "Planning",
    screenshotTitle: "Édition du planning",
    screenshotFile: "guide-planning-edit.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Statistiques du planning",
    description: "Visualisez les taux de présence et de disponibilité par département sur une période donnée. Export Excel disponible.",
    category: "Planning",
    screenshotTitle: "Statistiques du planning",
    screenshotFile: "guide-planning-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Événements ───────────────────────────────────────────────────────────
  {
    name: "Voir les événements",
    description: "Liste et calendrier mensuel des événements planifiés. Filtrez par type (Culte, Concert, Réunion…).",
    category: "Événements",
    screenshotTitle: "Liste et calendrier des événements",
    screenshotFile: "guide-events-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "read", REPORTER: "read", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gérer les événements",
    description: "Créez, modifiez ou supprimez des événements. Activez le suivi de présence pour le discipolat sur les événements concernés.",
    category: "Événements",
    screenshotTitle: "Gestion des événements",
    screenshotFile: "guide-events-manage.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Comptes rendus",
    description: "Saisissez les comptes rendus d'événements : orateur, titre du message, statistiques de présence par département. Export Excel des statistiques sur une période choisie.",
    category: "Événements",
    screenshotTitle: "Comptes rendus d'événements",
    screenshotFile: "guide-reports.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "edit", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Membres ──────────────────────────────────────────────────────────────
  {
    name: "Voir les membres (STAR)",
    description: "Liste des STAR avec leurs départements, ministères et informations de contact. Filtrée automatiquement selon le périmètre du rôle (ministère ou département assigné).",
    category: "Membres",
    screenshotTitle: "Liste des STAR",
    screenshotFile: "guide-members-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gérer les membres (STAR)",
    description: "Ajoutez, modifiez ou supprimez des STAR. Gérez leurs affectations à des départements (principal ou secondaire).",
    category: "Membres",
    screenshotTitle: "Gestion des STAR",
    screenshotFile: "guide-members-manage.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Discipolat ───────────────────────────────────────────────────────────
  {
    name: "Relations de discipolat",
    description: "Gérez les liens FD ↔ disciple. Ajoutez un disciple (STAR existant ou nouveau membre), modifiez le FD ou le premier FD. Filtre \"Mes disciples\" disponible pour les admin/secrétaires liés à une fiche STAR.",
    category: "Discipolat",
    screenshotTitle: "Relations de discipolat",
    screenshotFile: "guide-discipleship-relations.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "edit", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Appel de présence",
    description: "Enregistrez la présence de vos disciples pour chaque événement de discipolat. Les Faiseurs de Disciples ne peuvent marquer que leurs propres disciples.",
    category: "Discipolat",
    screenshotTitle: "Appel de présence discipolat",
    screenshotFile: "guide-discipleship-appel.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "edit", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Statistiques & Export",
    description: "Visualisez les taux de présence par disciple sur une période. Export Excel de l'ensemble des relations et statistiques de l'église (réservé à Super Admin, Admin et Secrétaire).",
    category: "Discipolat",
    screenshotTitle: "Statistiques discipolat",
    screenshotFile: "guide-discipleship-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "read", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Annonces ─────────────────────────────────────────────────────────────
  {
    name: "Nouvelle demande",
    description: "Déposez une demande : diffusion d'annonce (interne, réseaux sociaux, visuel) depuis /requests/new. Renseignez le titre, le brief, la deadline et les canaux souhaités.",
    category: "Demandes",
    screenshotTitle: "Nouvelle demande",
    screenshotFile: "guide-requests-new.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Mes demandes",
    description: "Suivez l'état de toutes vos soumissions depuis /requests : En attente, En cours, Livrée, Refusée. L'annonce principale affiche le statut du visuel associé si demandé.",
    category: "Demandes",
    screenshotTitle: "Mes demandes",
    screenshotFile: "guide-requests-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Traitement des demandes (Secrétariat)",
    description: "Vue centralisée de toutes les demandes de diffusion interne depuis /secretariat/requests. Marquez les annonces en cours, diffusées ou annulées. Visible pour les membres du département Secrétariat.",
    category: "Demandes",
    screenshotTitle: "Traitement des demandes — Secrétariat",
    screenshotFile: "guide-secretariat-dashboard.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Demandes visuels (Prod. Média)",
    description: "Traitez les demandes de création de visuels depuis l'onglet « Demandes visuels » du menu « Communication & Production ». Mettez à jour le statut et partagez le lien de livraison. Visible pour les membres du département Production Média.",
    category: "Demandes",
    screenshotTitle: "Dashboard Production Média",
    screenshotFile: "guide-media-dashboard.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Demandes réseaux sociaux (Communication)",
    description: "Traitez les demandes de publication réseaux sociaux depuis l'onglet « Demandes réseaux sociaux » du menu « Communication & Production ». Confirmez la publication ou signalez un refus avec note. Visible pour les membres du département Communication.",
    category: "Demandes",
    screenshotTitle: "Dashboard Communication",
    screenshotFile: "guide-communication-dashboard.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Absences ─────────────────────────────────────────────────────────────
  {
    name: "Indiquer mes disponibilités",
    description: "Depuis « Disponibilités », répondez pour chaque événement du mois : Disponible, Si besoin ou Pas disponible. Chaque mois, la collecte s'ouvre pour tous les STAR avec une date limite visible ; sans réponse après cette date, vous êtes considéré comme indisponible. Si vous servez dans plusieurs départements, « Préciser par département » permet de répondre différemment. Pour une absence de plusieurs jours, utilisez « Pas disponible du … au … », avec un remplaçant facultatif. Un responsable peut répondre à votre place (« Répondre pour… ») : la réponse porte alors la mention « Saisi par ».",
    category: "Absences",
    screenshotTitle: "Mes disponibilités",
    screenshotFile: "guide-disponibilites.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "edit", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "edit" },
  },
  {
    name: "Lire les disponibilités dans la grille",
    description: "Dans la grille du planning, chaque STAR affiche sa disponibilité (disponible, si besoin, sans réponse, indisponible, « en retard »), les STAR disponibles sont classés en premier et un compteur résume la situation. Placer un STAR indisponible reste possible mais affiche un avertissement avec la raison. « Interroger l'équipe » et « Relancer les sans-réponse » (une fois par jour) permettent de demander ou de relancer la réponse sans attendre la collecte.",
    category: "Absences",
    screenshotTitle: "Disponibilités dans la grille",
    screenshotFile: "guide-disponibilites-grille.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Régler la collecte",
    description: "Depuis « Disponibilités → Régler la collecte » : activer ou non la collecte automatique, combien de mois avant l'ouverture, combien de jours avant le début du mois pour la clôture et pour la relance des sans-réponse.",
    category: "Absences",
    screenshotTitle: "Paramètres de la collecte",
    screenshotFile: "guide-disponibilites-parametres.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Indisponibilités de mon périmètre",
    description: "L'onglet « Indisponibilités de l'équipe » (menu « Disponibilités ») liste les périodes d'absence et les réponses « Pas disponible » à venir de votre périmètre, en tableau ou en frise, avec filtres par période, département et statut. Une période à venir peut être modifiée (dates, départements, motif, remplaçants) ou annulée ; les conflits de planning sont réévalués. Export Excel respectant les filtres actifs.",
    category: "Absences",
    screenshotTitle: "Indisponibilités",
    screenshotFile: "guide-absences-vue-ensemble.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Tâches ───────────────────────────────────────────────────────────────
  {
    name: "Tâches de département",
    description: "Depuis le planning (/dashboard), la vue « Tâches » permet de définir les tâches récurrentes d'un département (Mixage, Retours, Accueil VIP…) et d'affecter un STAR à chacune pour un événement donné. Complète le planning : celui-ci dit qui est en service, les tâches disent qui fait quoi.",
    category: "Tâches",
    screenshotTitle: "Tâches du département",
    screenshotFile: "guide-taches.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Administration ────────────────────────────────────────────────────────
  {
    name: "Accès & rôles",
    description: "Attribuez les rôles (Ministre, Resp. Département, Secrétaire, FD, Reporter). Validez ou rejetez les demandes d'onboarding, et liez ou déliez un compte à une fiche STAR — la Secrétaire le peut également (spec 054). Un responsable de département peut être désigné adjoint (isDeputy).",
    category: "Administration",
    screenshotTitle: "Accès & rôles",
    screenshotFile: "guide-access-roles.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Ministères & départements",
    description: "Créez et organisez les ministères et leurs départements. Configurez les fonctions système (Secrétariat, Communication, Production Média) et les fonctions personnalisées — une fonction peut être partagée par plusieurs départements.",
    category: "Administration",
    screenshotTitle: "Gestion des ministères et départements",
    screenshotFile: "guide-admin-departments.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Paramètres de l'église",
    description: "Configurez le nom, l'email secrétariat (digest planning) et les paramètres généraux. Gestion multi-tenant pour les Super Admins.",
    category: "Administration",
    screenshotTitle: "Paramètres de l'église",
    screenshotFile: "guide-admin-church.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Gestion des utilisateurs",
    description: "Consultez tous les comptes de l'église, pré-créez-en un avant sa première connexion, ou supprimez un compte préparé par erreur qui ne s'est jamais connecté (spec 054).",
    category: "Administration",
    screenshotTitle: "Gestion des utilisateurs",
    screenshotFile: "guide-admin-users.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Journaux d'audit",
    description: "Historique complet et horodaté de toutes les modifications : qui a créé, modifié ou supprimé quoi. Filtrable par type d'entité et période.",
    category: "Administration",
    screenshotTitle: "Journaux d'audit",
    screenshotFile: "guide-admin-audit-logs.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Profil ────────────────────────────────────────────────────────────────
  {
    name: "Profil & liaison STAR",
    description: "Complétez votre profil et liez votre compte Google à votre fiche STAR. La liaison débloque les fonctionnalités avancées : filtre \"Mes disciples\", notifications personnalisées.",
    category: "Profil",
    screenshotTitle: "Profil et liaison STAR",
    screenshotFile: "guide-profile.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Salles ───────────────────────────────────────────────────────────────
  {
    name: "Réserver une salle",
    description: "Depuis /rooms, la vue « Semaine » affiche toutes les salles d'un coup, en grille salles × jours, pour repérer immédiatement celles qui sont libres ; le calendrier mensuel est lui aussi multi-salles et le choix d'une salle devient un filtre facultatif. Un encart « Mes réservations », visible quelle que soit la vue, liste vos prochaines réservations avec les actions de main courante au plus près. Réservez un créneau depuis cette même page. La réservation est soumise à l'accord de l'équipe de contrôle si la salle le requiert.",
    category: "Salles",
    screenshotTitle: "Réservation de salles",
    screenshotFile: "guide-salles-reservation.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "edit", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Contrôle des mains courantes",
    description: "Validez l'état des lieux (ouverture/fermeture) des salles réservées depuis /rooms/checklists. Accessible aux gestionnaires de salles et, par appartenance de département, aux membres de l'équipe de contrôle — indépendamment du rôle global.",
    category: "Salles",
    screenshotTitle: "Contrôle des mains courantes",
    screenshotFile: "guide-salles-mains-courantes.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Suivi pastoral ───────────────────────────────────────────────────────
  {
    name: "Demande de RDV pastoral",
    description: "Déposez une demande de rendez-vous avec un pasteur ou responsable depuis une tuile « Rendez-vous pastoral » dans « Mes demandes » (ou le lien de menu autonome pour le STAR, sans accès à « Mes demandes »). Disponible pour toute personne ayant accès au planning de son église. Suivez ensuite l'état de la demande (et, si elle est refusée, le motif) dans la section « Rendez-vous pastoraux » de « Mes demandes ».",
    category: "Suivi pastoral",
    screenshotTitle: "Demande de RDV pastoral",
    screenshotFile: "guide-care-demande.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "edit", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Qualification et affectation des demandes",
    description: "Depuis /care, confiez chaque demande de RDV en attente à un profil pastoral ou à un STAR accompagnant (membres du MSDP par défaut, plus les STAR ajoutés nominativement — voir « Accompagnants » ci-dessous ; indicateur « prévenu par email seulement » si le profil pastoral n'a pas de compte), avec une note optionnelle — ou rejetez-la avec un motif qualifié (liste fixe + commentaire libre). Une demande déjà confiée peut être réaffectée à un autre référent.",
    category: "Suivi pastoral",
    screenshotTitle: "Qualification et affectation des demandes de RDV",
    screenshotFile: "guide-care-qualification.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "none" },
  },
  {
    name: "Suivi par le référent : date et compte rendu",
    description: "Sur la fiche d'une demande confiée (/care/requests/[id]), le référent en charge peut fixer lui-même la date du rendez-vous s'il est membre du MSDP (un profil pastoral est planifié par le protocole, voir « Vue et planification agenda » ci-dessous), rendre la demande avec une raison s'il ne peut pas la suivre (elle revient aux Référents soins pastoraux pour être confiée à nouveau), puis renseigner le compte rendu du rendez-vous une fois celui-ci passé : tenu, orienté vers un suivi de nouveau converti, absent (clôturer ou replanifier), ou nouveau rendez-vous à reprendre.",
    category: "Suivi pastoral",
    screenshotTitle: "Suivi par le référent",
    screenshotFile: "guide-care-suivi-accompagnant.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "none" },
  },
  {
    name: "Suivi des nouveaux convertis (MSDP)",
    description: "Depuis l'onglet « Nouveaux convertis » de /care, créé automatiquement à la réponse à l'appel au salut : confiez le suivi à un profil pastoral ou à un membre du MSDP, puis, en tant que référent en charge, faites progresser le statut (contacté, en formation, terminé), ajoutez des notes, ou rendez le suivi au référent. Un Référent soins pastoraux peut aussi réaffecter ou rouvrir un suivi abandonné.",
    category: "Suivi pastoral",
    screenshotTitle: "Suivi des nouveaux convertis",
    screenshotFile: "guide-care-msdp.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "none" },
  },
  {
    name: "Vue et planification agenda",
    description: "Consultez l'agenda hebdomadaire de chaque profil pastoral depuis /agenda, planifiez les créneaux des demandes confiées à un profil pastoral depuis /agenda/schedule (un membre du MSDP fixe lui-même sa date depuis /care), ou ajoutez une entrée manuelle depuis /agenda/new. Un titulaire de profil pastoral voit également \"Mon agenda\", indépendamment de son rôle global.",
    category: "Suivi pastoral",
    screenshotTitle: "Vue et planification de l'agenda",
    screenshotFile: "guide-agenda-planification.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Paramètres du suivi pastoral (délais de relance)",
    description: "Depuis /care/parametres, réglez les deux délais au-delà desquels une demande est signalée à relancer dans le bandeau « À relancer » de /care : non confiée (alerte aux Référents soins pastoraux, 7 jours par défaut), et confiée sans suite — RDV sans date fixée ou suivi de nouveau converti sans premier contact (alerte au référent en charge, 14 jours par défaut).",
    category: "Suivi pastoral",
    screenshotTitle: "Paramètres du suivi pastoral",
    screenshotFile: "guide-care-parametres.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "none" },
  },
  {
    name: "Accompagnants du suivi pastoral",
    description: "Depuis /care/parametres, section « Accompagnants » : tout membre du MSDP est accompagnant par défaut (décochez pour en écarter un, sans retirer les demandes déjà en cours) ; ajoutez aussi un STAR d'un autre département qui accompagne effectivement (il peut être retiré de la même façon). Un STAR qui rejoint le MSDP devient accompagnant automatiquement.",
    category: "Suivi pastoral",
    screenshotTitle: "Accompagnants du suivi pastoral",
    screenshotFile: "guide-care-accompagnants.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "none" },
  },
  {
    name: "Supprimer une demande",
    description: "Sur la fiche d'une demande de rendez-vous pastoral, d'un suivi de nouveau converti ou d'une demande d'intégration, le bouton « Supprimer » efface définitivement la demande, son historique et ses notifications (par exemple un doublon, un test, ou à la demande de la personne). Une demande dont est issu un suivi ou un rendez-vous ne peut être supprimée qu'après eux : la fiche indique lesquels.",
    category: "Suivi pastoral",
    screenshotTitle: "Supprimer une demande",
    screenshotFile: "guide-care-suppression.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Statistiques du suivi pastoral",
    description: "Visualisez depuis /care/stats les volumes de demandes de RDV par état, par référent et les motifs de rejet, ainsi que les statistiques du suivi MSDP (entonnoir, délais, jalons de parcours).",
    category: "Suivi pastoral",
    screenshotTitle: "Statistiques du suivi pastoral",
    screenshotFile: "guide-care-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "none" },
  },

  // ── Comptabilité ─────────────────────────────────────────────────────────
  {
    name: "Soumettre une demande financière",
    description: "Déposez une note de frais ou une demande d'avance de budget depuis /accounting/requests/new. Un titulaire de profil pastoral peut également soumettre, indépendamment de son rôle global.",
    category: "Comptabilité",
    screenshotTitle: "Nouvelle demande financière",
    screenshotFile: "guide-comptabilite-demande.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Traiter les demandes financières",
    description: "Consultez et traitez les notes de frais et avances de budget depuis /accounting/requests : confirmez le paiement ou refusez avec un motif. Les Ministres et Resp. département voient leurs propres demandes en lecture seule.",
    category: "Comptabilité",
    screenshotTitle: "Gestion des demandes financières",
    screenshotFile: "guide-comptabilite-gestion.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "edit" },
  },
  {
    name: "Statistiques comptables",
    description: "Visualisez le total des demandes financières sur l'année en cours depuis /accounting/stats, par statut et par département.",
    category: "Comptabilité",
    screenshotTitle: "Statistiques comptables",
    screenshotFile: "guide-comptabilite-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "edit" },
  },

  // ── Emplois ──────────────────────────────────────────────────────────────
  {
    name: "Offres, recherches d'emploi & freelance",
    description: "Publiez ou consultez des offres d'emploi, des profils en recherche, et des missions freelance depuis /jobs (trois onglets). Fonctionnalité ouverte à tous les comptes de l'église.",
    category: "Emplois",
    screenshotTitle: "Offres et recherches d'emploi",
    screenshotFile: "guide-emplois-liste.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "edit", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "edit" },
  },
  {
    name: "Modération des annonces",
    description: "Modérez et supprimez si besoin toute offre, recherche ou mission publiée par un autre compte, depuis /admin/jobs.",
    category: "Emplois",
    screenshotTitle: "Modération des annonces",
    screenshotFile: "guide-emplois-moderation.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Intégration ──────────────────────────────────────────────────────────
  {
    name: "Demandes d'intégration (familles)",
    description: "Suivez les demandes d'intégration de nouvelles familles depuis /integration/requests : assignez un berger, faites avancer le statut, filtrez les demandes en attente. L'étiquette « Adresse non rattachée » signale une adresse qu'aucune famille ne couvre. Accessible aussi, par appartenance de département (fonction Intégration) ou en tant que berger assigné, indépendamment du rôle global.",
    category: "Intégration",
    screenshotTitle: "Demandes d'intégration",
    screenshotFile: "guide-integration-demandes.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Attente, relances et renvoi d'une demande",
    description: "Sur la fiche d'une demande, « À recontacter plus tard » (la personne souhaite être recontactée ultérieurement, ou reste injoignable pour l'instant) et « Transmettre au département mission » (adresse hors zone, réservé à l'équipe intégration) sortent la demande de la file « À traiter » sans la perdre. Une fois le délai réglé écoulé, la demande apparaît dans le bandeau « À relancer » et toute l'équipe intégration est notifiée ; après avoir relancé, cliquez « J'ai relancé » pour remettre le décompte à zéro, puis « Reprendre le suivi » quand la personne ou le département mission a répondu. Un berger peut mettre en attente les demandes qui lui sont confiées, ou les « Renvoyer à l'intégration » avec une raison s'il ne peut pas les suivre. Un abandon exige un motif (numéro inconnu, injoignable, ne souhaite plus être contacté·e…). Chaque changement est conservé dans l'historique en bas de fiche. Les nouveaux arrivants peuvent aussi choisir, dès le formulaire d'accueil, d'être recontactés plus tard.",
    category: "Intégration",
    screenshotTitle: "Attente et relances",
    screenshotFile: "guide-integration-attente.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Paramètres intégration (délais de relance)",
    description: "Depuis /integration/parametres, réglez les deux délais au-delà desquels une demande en attente est signalée comme à relancer : l'attente de recontact (60 jours par défaut) et l'attente du département mission (30 jours par défaut). Accessible à l'Admin, au Secrétaire et au responsable du département intégration.",
    category: "Intégration",
    screenshotTitle: "Paramètres intégration",
    screenshotFile: "guide-integration-parametres.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Bergers de famille",
    description: "Gérez la liste des bergers de famille et leurs affectations depuis /integration/leaders.",
    category: "Intégration",
    screenshotTitle: "Bergers de famille",
    screenshotFile: "guide-integration-bergers.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Parcours & statistiques d'intégration",
    description: "Consultez le parcours d'intégration type et les statistiques (délais, taux de complétion, répartition des abandons par motif) depuis /integration/parcours et /integration/stats.",
    category: "Intégration",
    screenshotTitle: "Parcours et statistiques d'intégration",
    screenshotFile: "guide-integration-stats.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },

  // ── Audio ────────────────────────────────────────────────────────────────
  {
    name: "(re)Écouter les cultes",
    description: "Depuis /audio, retrouvez la bibliothèque des cultes publiés : recherche par titre, orateur, type ou période, lecture avec vitesse ajustable et reprise d'écoute, partage d'un lien par culte ou par séquence. Accessible à tout membre connecté, quel que soit son rôle.",
    category: "Audio",
    screenshotTitle: "Bibliothèque d'écoute",
    screenshotFile: "guide-audio-library.png",
    access: { SUPER_ADMIN: "read", ADMIN: "read", SECRETARY: "read", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "read", REPORTER: "read", STAR: "read", PASTORAL_CARE_REFERENT: "read", ACCOUNTANT: "read" },
  },
  {
    name: "Production audio (dépôt, découpage, publication)",
    description: "Depuis l'onglet Production de /audio, déposez les séquences enregistrées, ajustez leur ordre et leurs noms, puis publiez le culte pour le rendre disponible dans la bibliothèque et via un lien partageable. Réservé aux rôles de gestion et aux membres du département de captation audio.",
    category: "Audio",
    screenshotTitle: "File d'attente Production audio",
    screenshotFile: "guide-audio-production.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Paramètres audio",
    description: "Depuis l'onglet Paramètres de /audio, définissez la couverture par défaut des cultes et le modèle de séquences appliqué aux nouveaux dépôts. Le département de captation se configure comme une fonction de département, dans Configuration → Départements → Fonctions.",
    category: "Audio",
    screenshotTitle: "Paramètres audio",
    screenshotFile: "guide-audio-parametres.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Dépublier un culte",
    description: "Un culte publié par erreur peut être retiré de la bibliothèque. Volontairement plus restreint que la publication : réservé aux Super Admin et Admin, ou au responsable du département de captation audio.",
    category: "Audio",
    screenshotTitle: "Dépublication d'un culte",
    screenshotFile: "guide-audio-depublier.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Cycle de vie des offres",
    description: "Une offre publiée ne reste plus en ligne indéfiniment. Après 60 jours sans modification, son auteur est relancé par email et par notification pour confirmer qu'elle est toujours d'actualité — un bandeau et un bouton « Toujours d'actualité » apparaissent alors sur la page de l'offre. Sans réponse sous 14 jours, l'offre est archivée automatiquement. Toute modification de l'offre vaut confirmation.",
    category: "Emplois",
    screenshotTitle: "Relance d'une offre d'emploi",
    screenshotFile: "guide-emplois-relance.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "edit", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "edit" },
  },
  {
    name: "Récapitulatif WhatsApp",
    description: "Le bouton « Copier pour WhatsApp » compose un message texte résumant les offres affichées — le filtre de type actif est respecté — et le place dans le presse-papier, prêt à coller dans un groupe. Les coordonnées de contact déposées par l'auteur n'y figurent pas : le message renvoie vers l'application.",
    category: "Emplois",
    screenshotTitle: "Récapitulatif WhatsApp des offres",
    screenshotFile: "guide-emplois-whatsapp.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "edit", REPORTER: "edit", STAR: "edit", PASTORAL_CARE_REFERENT: "edit", ACCOUNTANT: "edit" },
  },
  {
    name: "Export Excel des demandes",
    description: "Exportez la liste des demandes d'intégration au format Excel. Le fichier contient exactement les demandes affichées à l'écran : les filtres actifs sont respectés. Les notes internes, le motif d'abandon et l'adresse postale en sont exclus. Réservé aux rôles qui voient l'ensemble des demandes de l'église, et tracé dans le journal d'audit.",
    category: "Intégration",
    screenshotTitle: "Export des demandes d'intégration",
    screenshotFile: "guide-integration-export.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
  {
    name: "Sauvegardes et export de configuration",
    description: "Depuis /admin/backups, déclenchez une sauvegarde de la base et exportez la configuration de l'église (structure des ministères et départements, comptes et rôles) au format JSON. Sert aussi à monter un environnement de test ou de formation.",
    category: "Administration",
    screenshotTitle: "Sauvegardes et export de configuration",
    screenshotFile: "guide-admin-backups.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none", STAR: "none", PASTORAL_CARE_REFERENT: "none", ACCOUNTANT: "none" },
  },
];

const ROLES: readonly RoleKey[] = ALL_ROLES;

function AccessBadge({ level }: { readonly level: AccessLevel }) {
  switch (level) {
    case "edit":
      return <StatusChip tone="success" icon={Pencil}>Édition</StatusChip>;
    case "read":
      return <StatusChip tone="info" icon={Eye}>Lecture</StatusChip>;
    case "none":
      return <StatusChip tone="neutral" icon={Ban}>Pas d&apos;accès</StatusChip>;
  }
}

/**
 * Capture d'ecran d'une fonctionnalite, hebergee sur la release `guide-assets`.
 *
 * Les captures sont publiees a la main, en decalage avec le code : une
 * fonctionnalite documentee avant que sa capture n'existe affichait jusqu'ici
 * l'icone d'image cassee du navigateur. On rend ce cas explicite et sobre
 * plutot que de laisser croire a un bug.
 */
function Screenshot({
  file,
  title,
  onZoom,
}: {
  readonly file: string;
  readonly title: string;
  readonly onZoom: (image: { src: string; alt: string }) => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = `${GUIDE_ASSETS_BASE}/${file}`;

  if (failed) {
    return (
      <div className="w-full aspect-video bg-surface-sunken rounded-lg border border-dashed border-line flex items-center justify-center">
        <span className="text-xs text-ink-subtle">Capture à venir</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onZoom({ src, alt: title })}
      className="w-full aspect-video bg-surface-sunken rounded-lg border border-line overflow-hidden cursor-zoom-in group"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        className="w-full h-full object-contain transition-transform group-hover:scale-105"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </button>
  );
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
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-card bg-brand-soft p-4">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-ink">Découvrir l&apos;interface</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Lancez une visite guidée pour découvrir les fonctionnalités principales.
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard?tour=1")}
          type="button"
          className={`${buttonClasses("primary")} shrink-0`}
        >
          <CirclePlay aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Lancer la visite guidée
        </button>
      </div>

      {/* Onglets par rôle */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setActiveRole(role)}
            type="button"
            aria-pressed={activeRole === role}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-display text-sm font-semibold transition-colors ${
              activeRole === role
                ? "border-brand text-brand-text"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {/* Description du rôle */}
      <div className="mb-6 rounded-card border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold text-brand-text">{ROLE_LABELS[activeRole]}</h2>
        <p className="text-sm text-ink-muted mt-1">{ROLE_DESCRIPTIONS[activeRole]}</p>
        {activeRole === "MINISTER" && (
          <p className="text-xs text-ink-muted mt-2 italic">
            * Le ministre a accès uniquement aux départements de son ministère assigné.
          </p>
        )}
        {activeRole === "SUPER_ADMIN" && (
          <p className="text-xs text-ink-muted mt-2 italic">
            * Les dashboards Secrétariat, Demandes visuels et Demandes réseaux sociaux sont visibles selon l&apos;appartenance au département concerné (fonction système) — ces deux derniers regroupés sous le menu « Communication & Production ».
          </p>
        )}
      </div>

      {/* Fonctionnalités par catégorie */}
      <div className="space-y-8">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="text-base font-semibold text-ink mb-4 border-b pb-2">{category}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleFeatures.filter((f) => f.category === category).map((feature) => (
                <div key={feature.name} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-ink-muted">{feature.name}</h4>
                    <AccessBadge level={feature.access[activeRole]} />
                  </div>
                  <p className="text-xs text-ink-muted">{feature.description}</p>
                  <Screenshot
                    file={feature.screenshotFile}
                    title={feature.screenshotTitle}
                    onZoom={setZoomedImage}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Modale zoom image */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim cursor-zoom-out p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 text-ink bg-surface/90 hover:bg-surface rounded-full shadow-float p-2 transition-colors"
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
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
