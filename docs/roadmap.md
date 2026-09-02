# Roadmap

## Demandes et production media (système unifié)

- [x] Système unifié de demandes (`Request`) : annonces + événements + accès dans un seul modèle
- [x] Migration `ServiceRequest` → `Request` avec payload JSON type-spécifique
- [x] `DepartmentFunction` : enum → `String?` (flexible, extensible)
- [x] "Mes demandes" (`/requests`) : liste unifiée annonces + demandes pour le soumetteur
- [x] Formulaire unifié (`/requests/new`) : cartes par type, champs dynamiques
- [x] Dashboard Secrétariat (`/secretariat/requests`) — traitement de toutes les demandes
- [x] Dashboard Production Media (`/media/requests`) — traitement des VISUEL
- [x] Dashboard Communication (`/communication/requests`) — traitement des RESEAUX_SOCIAUX
- [x] Demande visuel standalone sans annonce (intégrée dans `/requests/new` — carte "Demander un visuel")
- [x] Configuration des fonctions départementales (`/admin/departments/functions`)
- [x] Flag `allowAnnouncements` sur les événements
- [x] Relation auto-référentielle VISUEL → canal parent (format contextualisé)
- [x] Exécution automatique des demandes approuvées (`executeRequest()` dans `request-executor.ts`)
- [x] Module Media : événements, projets, pages publiques (`/media/*`)
- [x] Module Media : gestion des phases (v/g/d) par projet

## Interface utilisateur

- [x] Composants UI partagés (Button, Card, Input, Modal, Select, DataTable, CheckboxGroup)
- [x] Sidebar : highlight du département sélectionné (active state)
- [x] Thème ICC (couleurs `icc-violet`, `icc-jaune`, `icc-rouge`, `icc-bleu`)
- [x] Événements : renommer le bouton "STAR" en "Planning des STAR" et "Detail" en "Départements en service"
- [x] Événements : améliorer l'affichage des départements en service (grille responsive)

### Responsive mobile & UX mobile

- [x] Sidebar collapsible : menu hamburger sur mobile (< md), overlay ou drawer, fermeture au clic extérieur
- [x] Layout authentifié : `flex-col` sur mobile, `flex-row` à partir de `md`
- [x] Header : adapter pour petits écrans (titre tronqué ou masqué, actions compactes)
- [x] PlanningGrid : vue carte sur mobile au lieu de la grille de boutons de statut
- [x] DataTable : vue carte/liste empilée sur mobile en alternative au tableau horizontal
- [x] Boutons : tailles tactiles minimum 44x44px, padding adapté (`px-3 py-2 md:px-4 md:py-2`)
- [x] Modals : plein écran sur mobile (`md:max-w-lg`)
- [x] Formulaires : inputs pleine largeur, espacement adapté au tactile
- [x] StarView (planning STAR) : grille 1 colonne sur mobile, 2 sur tablette, 3+ sur desktop
- [x] Navigation mobile : barre de navigation fixe en bas (bottom nav) en alternative à la sidebar
- [x] PWA : manifest + service worker pour installation sur écran d'accueil (voir section Technique)

## Administration

- [x] Page Super Admin : liste des églises, création, suppression
- [x] Onboarding nouvelle église (création + invitation admin)
- [x] Gestion des utilisateurs : attribution des rôles depuis l'interface
- [x] Affectation ministère/départements aux rôles MINISTER et DEPARTMENT_HEAD
- [x] Gestion des ministères et départements (CRUD)
- [x] Section Ministères : accès en consultation seule pour les Ministres (pas de création/modification/suppression)
- [x] Gestion des membres (ajout, modification, suppression, transfert entre départements)
- [x] Gestion des événements (création, modification, suppression, types personnalisés)
- [x] Association départements-événements depuis l'interface
- [x] Schéma dédié Super Admin (rôle global indépendant des églises)
- [x] Utilisateurs : permettre aux admins, secrétaires et utilisateurs de modifier leur nom d'affichage
- [x] Utilisateurs : recherche par nom ou email + navigation alphabétique dans la liste

## Planning

- [x] Section planification des départements : filtre par mois pour les événements
- [x] Section planification des départements : export du planning mensuel en PDF ou image
- [x] Vue planning des départements : sélecteur de mois
- [x] Notion de tâche/affectation : permettre aux responsables de départements d'affecter leurs STAR à une activité (visible dans la vue planning des départements, non visible dans la vue planning des STAR)
- [x] Création d'événements avec récurrence (hebdomadaire, mensuel, etc.)
- [x] Gestion facilitée des départements en service pour les événements récurrents
- [x] Vue calendrier des événements
- [x] Duplication d'un planning d'un événement à un autre
- [x] Historique des modifications (audit log)
- [x] Date/heure limite de planification par événement : avant échéance, seuls les responsables de département, leurs ministres et les admins peuvent modifier le planning ; après échéance, seuls les admins et secrétaires conservent la main
- [x] Export PDF du planning par événement / département

## Notifications

- [x] Notifications email pour rappels de service (J-3, J-1)
- [x] Notifications in-app (badge, toast)

## Statistiques

- [x] Taux de présence par membre et département
- [x] Nombre de services par membre sur une période
- [x] Dashboard avec graphiques de tendances

## Discipolat

- [x] Modèle Discipleship : relation disciple/faiseur de disciples avec lignée (firstMakerId)
- [x] Modèle DiscipleshipAttendance : suivi des présences par événement
- [x] Rôle DISCIPLE_MAKER avec permissions discipleship:view et discipleship:manage
- [x] Flag trackedForDiscipleship sur les événements
- [x] API REST : CRUD, attendance, stats, tree (lignée récursive), export Excel
- [x] Dashboard /admin/discipleship : 3 onglets (Relations, Appel, Statistiques)
- [x] Export Excel : feuille statistiques + feuille détail présences
- [x] Notifications rappel de suivi pour les faiseurs de disciples

## Comptes rendus

- [x] Modèles EventReport et EventReportSection (schéma Prisma)
- [x] Flags reportEnabled et statsEnabled sur les événements
- [x] API REST : GET/PUT /api/events/[eventId]/report
- [x] Page de saisie avec sauvegarde auto (debounce)
- [x] Statistiques par département (Accueil, Intégration, Sainte-Cène)
- [x] Dashboard /admin/reports : liste + statistiques agrégées par mois
- [x] Rôle REPORTER : accès lecture/écriture aux CR sans droits admin
- [x] Permission reports:edit séparée de reports:view
- [x] Champs orateur et titre du message dans les comptes rendus
- [x] Export Excel des statistiques hebdomadaires des cultes avec sélection de période
- [x] Export PDF des comptes rendus

## Gestion des accès

- [x] Page /admin/access : attribution des ministres et responsables de département
- [x] Distinction principal/adjoint (isDeputy) sur les responsables de département
- [x] Onglet Comptes rendus : toggle REPORTER par utilisateur
- [x] Onglet STAR : visualisation du statut de liaison compte-membre, toggle rôle STAR
- [x] Réorganisation du menu sidebar en 7 sections (Planning, Événements, Membres, Demandes, Médias, Discipolat, Configuration)
- [x] Sidebar : section "Demandes" limitée aux flux de requêtes (Mes demandes + Gestion secrétariat)
- [x] Sidebar : section "Medias" séparée (Événements, Projets, Visuels, Communication) — visible selon permissions media:view ou appartenance au département
- [x] Sidebar : "Discipolat" passe en lien direct (suppression de l'accordéon superflu)

## Liaison compte STAR

- [x] Modèles MemberUserLink et MemberLinkRequest
- [x] Page profil /profile : visualisation et demande de liaison
- [x] Interface admin : colonne Compte et bouton Lier sur la page membres
- [x] Liaison indépendante de l'attribution de rôle
- [x] Notification aux admins/secrétaires lors d'une nouvelle demande de liaison
- [x] Notification au demandeur lors de l'approbation ou du rejet de sa demande
- [x] Attribution du rôle STAR depuis /admin/access (onglet dédié)

## Espace STAR (membre actif)

- [x] Rôle `STAR` dans l'enum `Role` Prisma
- [x] Session callback : départements du STAR dérivés automatiquement depuis `MemberUserLink → Member → MemberDepartment` (sans `user_departments`)
- [x] Page "Mon planning" (`/planning`) : liste des services futurs et passés du membre lié
- [x] Sidebar : lien "Mon planning" visible uniquement pour les utilisateurs STAR-only
- [x] Guide utilisateur : onglet et description pour le rôle STAR
- [x] `isStarOnly` flag dans le layout pour conditionner la navigation

## Guide utilisateur

- [x] Page guide des fonctionnalités par rôle (onglets, badges d'accès, placeholders)
- [x] Icône guide dans le header (lien vers /guide)
- [x] Remplacer les placeholders par de vraies captures d'écran annotées
- [x] Tutoriel interactif (onboarding guide pas-à-pas pour les nouveaux utilisateurs)

## Technique

- [x] Tests unitaires (Vitest)
- [x] Tests d'intégration API
- [x] CI/CD (GitHub Actions : typecheck, version check)
- [x] Dependabot (mises à jour automatiques des dépendances)
- [x] Affichage de la version dans le footer
- [x] Déploiement production (Docker multi-stage + reverse proxy)
- [x] Migrations Prisma (remplacer `db push` par `prisma migrate`)
- [x] PWA (manifest, service worker, installation mobile)
- [x] Rate limiting sur les API routes
- [x] Logs structurés (pino ou similaire)
- [x] Migrations Prisma correctrices (rattrapage db push → migrate)
- [x] Script d'import Mediaflow → ICC Platform (`prisma/scripts/import-mediaflow.ts`) : mapping churches, déduplication users, import tables media, idempotent
- [x] Monitoring applicatif (healthcheck, métriques)
- [ ] Séparer le compte runtime du compte de déploiement (audit H-10) — voir [TODO dédié](todo-separation-comptes-deploiement.md)
- [ ] Rendre les modules réellement modulaires au niveau métier (sortir la logique des routes, étendre les frontières aux 11 modules) — voir [roadmap dédiée](roadmap-modularite.md)
- [ ] Épingler l'identité SSH des hôtes de déploiement (audit M-08) — risque accepté en attendant, voir [docs/production.md](production.md) section « Identité SSH de l'hôte »
