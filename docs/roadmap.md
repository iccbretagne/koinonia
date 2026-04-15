# Roadmap

## Demandes et production media (systeme unifie)

- [x] Systeme unifie de demandes (`Request`) : annonces + evenements + acces dans un seul modele
- [x] Migration `ServiceRequest` → `Request` avec payload JSON type-specifique
- [x] `DepartmentFunction` : enum → `String?` (flexible, extensible)
- [x] "Mes demandes" (`/requests`) : liste unifiee annonces + demandes pour le soumetteur
- [x] Formulaire unifie (`/requests/new`) : cartes par type, champs dynamiques
- [x] Dashboard Secretariat (`/secretariat/requests`) — traitement de toutes les demandes
- [x] Dashboard Production Media (`/media/requests`) — traitement des VISUEL
- [x] Dashboard Communication (`/communication/requests`) — traitement des RESEAUX_SOCIAUX
- [x] Demande visuel standalone sans annonce (intégrée dans `/requests/new` — carte "Demander un visuel")
- [x] Configuration des fonctions departementales (`/admin/departments/functions`)
- [x] Flag `allowAnnouncements` sur les evenements
- [x] Relation auto-referentielle VISUEL → canal parent (format contextualise)
- [x] Execution automatique des demandes approuvees (`executeRequest()` dans `request-executor.ts`)
- [x] Module Media : evenements, projets, pages publiques (`/media/*`)
- [x] Module Media : gestion des phases (v/g/d) par projet

## Interface utilisateur

- [x] Composants UI partages (Button, Card, Input, Modal, Select, DataTable, CheckboxGroup)
- [x] Sidebar : highlight du departement selectionne (active state)
- [x] Theme ICC (couleurs `icc-violet`, `icc-jaune`, `icc-rouge`, `icc-bleu`)
- [x] Evenements : renommer le bouton "STAR" en "Planning des STAR" et "Detail" en "Departements en service"
- [x] Evenements : ameliorer l'affichage des departements en service (grille responsive)

### Responsive mobile & UX mobile

- [x] Sidebar collapsible : menu hamburger sur mobile (< md), overlay ou drawer, fermeture au clic exterieur
- [x] Layout authentifie : `flex-col` sur mobile, `flex-row` a partir de `md`
- [x] Header : adapter pour petits ecrans (titre tronque ou masque, actions compactes)
- [x] PlanningGrid : vue carte sur mobile au lieu de la grille de boutons de statut
- [x] DataTable : vue carte/liste empilee sur mobile en alternative au tableau horizontal
- [x] Boutons : tailles tactiles minimum 44x44px, padding adapte (`px-3 py-2 md:px-4 md:py-2`)
- [x] Modals : plein ecran sur mobile (`md:max-w-lg`)
- [x] Formulaires : inputs pleine largeur, espacement adapte au tactile
- [x] StarView (planning STAR) : grille 1 colonne sur mobile, 2 sur tablette, 3+ sur desktop
- [x] Navigation mobile : barre de navigation fixe en bas (bottom nav) en alternative a la sidebar
- [x] PWA : manifest + service worker pour installation sur ecran d'accueil (voir section Technique)

## Administration

- [x] Page Super Admin : liste des eglises, creation, suppression
- [x] Onboarding nouvelle eglise (creation + invitation admin)
- [x] Gestion des utilisateurs : attribution des roles depuis l'interface
- [x] Affectation ministere/departements aux roles MINISTER et DEPARTMENT_HEAD
- [x] Gestion des ministeres et departements (CRUD)
- [x] Section Ministeres : acces en consultation seule pour les Ministres (pas de creation/modification/suppression)
- [x] Gestion des membres (ajout, modification, suppression, transfert entre departements)
- [x] Gestion des evenements (creation, modification, suppression, types personnalises)
- [x] Association departements-evenements depuis l'interface
- [x] Schema dedie Super Admin (role global independant des eglises)
- [x] Utilisateurs : permettre aux admins, secretaires et utilisateurs de modifier leur nom d'affichage
- [x] Utilisateurs : recherche par nom ou email + navigation alphabetique dans la liste

## Planning

- [x] Section planification des departements : filtre par mois pour les evenements
- [x] Section planification des departements : export du planning mensuel en PDF ou image
- [x] Vue planning des departements : selecteur de mois
- [x] Notion de tache/affectation : permettre aux responsables de departements d'affecter leurs STAR a une activite (visible dans la vue planning des departements, non visible dans la vue planning des STAR)
- [x] Creation d'evenements avec recurrence (hebdomadaire, mensuel, etc.)
- [x] Gestion facilitee des departements en service pour les evenements recurrents
- [x] Vue calendrier des evenements
- [x] Duplication d'un planning d'un evenement a un autre
- [x] Historique des modifications (audit log)
- [x] Date/heure limite de planification par evenement : avant echeance, seuls les responsables de departement, leurs ministres et les admins peuvent modifier le planning ; apres echeance, seuls les admins et secretaires conservent la main
- [x] Export PDF du planning par evenement / departement

## Notifications

- [x] Notifications email pour rappels de service (J-3, J-1)
- [ ] Integration WhatsApp (API Business)
- [x] Notifications in-app (badge, toast)
- [ ] Notifications push (Web Push API)

## Statistiques

- [x] Taux de presence par membre et departement
- [x] Nombre de services par membre sur une periode
- [x] Dashboard avec graphiques de tendances

## Discipolat

- [x] Modele Discipleship : relation disciple/faiseur de disciples avec lignee (firstMakerId)
- [x] Modele DiscipleshipAttendance : suivi des presences par evenement
- [x] Role DISCIPLE_MAKER avec permissions discipleship:view et discipleship:manage
- [x] Flag trackedForDiscipleship sur les evenements
- [x] API REST : CRUD, attendance, stats, tree (lignee recursive), export Excel
- [x] Dashboard /admin/discipleship : 3 onglets (Relations, Appel, Statistiques)
- [x] Export Excel : feuille statistiques + feuille detail presences
- [ ] Notifications rappel de suivi pour les faiseurs de disciples

## Comptes rendus

- [x] Modeles EventReport et EventReportSection (schema Prisma)
- [x] Flags reportEnabled et statsEnabled sur les evenements
- [x] API REST : GET/PUT /api/events/[eventId]/report
- [x] Page de saisie avec sauvegarde auto (debounce)
- [x] Statistiques par departement (Accueil, Integration, Sainte-Cene)
- [x] Dashboard /admin/reports : liste + statistiques agregees par mois
- [x] Role REPORTER : acces lecture/ecriture aux CR sans droits admin
- [x] Permission reports:edit separee de reports:view
- [x] Champs orateur et titre du message dans les comptes rendus
- [x] Export Excel des statistiques hebdomadaires des cultes avec selection de periode
- [ ] Export PDF des comptes rendus
- [ ] Historique des modifications d'un CR

## Gestion des acces

- [x] Page /admin/access : attribution des ministres et responsables de departement
- [x] Distinction principal/adjoint (isDeputy) sur les responsables de departement
- [x] Onglet Comptes rendus : toggle REPORTER par utilisateur
- [x] Onglet STAR : visualisation du statut de liaison compte-membre, toggle role STAR
- [x] Reorganisation du menu sidebar en 7 sections (Planning, Evenements, Membres, Demandes, Medias, Discipolat, Configuration)
- [x] Sidebar : section "Demandes" limitee aux flux de requetes (Mes demandes + Gestion secrétariat)
- [x] Sidebar : section "Medias" separee (Evenements, Projets, Visuels, Communication) — visible selon permissions media:view ou appartenance au departement
- [x] Sidebar : "Discipolat" passe en lien direct (suppression de l'accordéon superflu)

## Liaison compte STAR

- [x] Modeles MemberUserLink et MemberLinkRequest
- [x] Page profil /profile : visualisation et demande de liaison
- [x] Interface admin : colonne Compte et bouton Lier sur la page membres
- [x] Liaison independante de l'attribution de role
- [x] Notification aux admins/secretaires lors d'une nouvelle demande de liaison
- [x] Notification au demandeur lors de l'approbation ou du rejet de sa demande
- [x] Attribution du role STAR depuis /admin/access (onglet dedie)

## Espace STAR (membre actif)

- [x] Role `STAR` dans l'enum `Role` Prisma
- [x] Session callback : departements du STAR derives automatiquement depuis `MemberUserLink → Member → MemberDepartment` (sans `user_departments`)
- [x] Page "Mon planning" (`/planning`) : liste des services futurs et passes du membre lie
- [x] Sidebar : lien "Mon planning" visible uniquement pour les utilisateurs STAR-only
- [x] Guide utilisateur : onglet et description pour le role STAR
- [x] `isStarOnly` flag dans le layout pour conditionner la navigation

## Guide utilisateur

- [x] Page guide des fonctionnalites par role (onglets, badges d'acces, placeholders)
- [x] Icone guide dans le header (lien vers /guide)
- [x] Remplacer les placeholders par de vraies captures d'ecran annotees
- [x] Tutoriel interactif (onboarding guide pas-a-pas pour les nouveaux utilisateurs)

## Technique

- [x] Tests unitaires (Vitest)
- [x] Tests d'integration API
- [x] CI/CD (GitHub Actions : typecheck, version check)
- [x] Dependabot (mises a jour automatiques des dependances)
- [x] Affichage de la version dans le footer
- [x] Deploiement production (Docker multi-stage + reverse proxy)
- [x] Migrations Prisma (remplacer `db push` par `prisma migrate`)
- [x] PWA (manifest, service worker, installation mobile)
- [x] Rate limiting sur les API routes
- [x] Logs structures (pino ou similaire)
- [x] Migrations Prisma correctrices (rattrapage db push → migrate)
- [x] Script d'import Mediaflow → ICC Platform (`prisma/scripts/import-mediaflow.ts`) : mapping churches, déduplication users, import tables media, idempotent
- [ ] Tests E2E (Playwright ou Cypress)
- [ ] Monitoring applicatif (healthcheck, metriques)
