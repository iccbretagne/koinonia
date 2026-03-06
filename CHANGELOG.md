# Changelog

Toutes les modifications notables de ce projet sont documentees ici.
Format inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Ce projet suit [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publie]

## [v0.7.2] - 2026-03-06

### Ameliore

- Checkbox serie : bandeau violet avec icone de recurrence pour meilleure visibilite

## [v0.7.1] - 2026-03-06

### Corrige

- Ajout migration manquante pour la colonne `hasSeenTour` (tour guide)

## [v0.7.0] - 2026-03-06

### Ajoute

- Sidebar : departements groupes par ministere (accordeon imbrique)
- Tour guide interactif (GuidedTour) avec etapes contextuelles
- API user preferences pour persister l'etat du tour guide
- Attributs data-tour sur les composants pour le guidage

### Ameliore

- EventSelector, BottomNav, NotificationBell : ameliorations responsive
- Planning route : optimisation des requetes
- Suppression de ScreenshotPlaceholder (remplace par images reelles)

## [v0.6.0] - 2026-03-06

### Ajoute

- Page Guide des fonctionnalites par role (`/guide`) avec onglets, badges d'acces et captures
- Conteneur images 16:9 (`aspect-video` + `object-contain`) sans deformation
- Descriptions d'actions pour chaque fonctionnalite du guide
- Filtrage par role : masquage des fonctionnalites inaccessibles
- Deploiement automatise via SSH sur push de tag v* (workflow CD)
- Declenchement manuel du workflow deploy
- Script de deploiement manuel `scripts/deploy.sh`

### Corrige

- Symlink `.env` force lors du deploiement
- Utilisation de `prisma migrate deploy` en production

## [v0.5.0] - 2026-03-04

### Ajoute

- Modification en serie des evenements recurrents : modal de choix (cet evenement / toute la serie)
- Propagation de l'heure et du type a toute la serie avec gestion du changement d'heure (DST)
- Delai de planification intelligent : selecteur de delai (6h a 7j) avec pre-remplissage automatique
- Calcul de deadline relative par occurrence lors de la creation et modification en serie
- Taches permanentes par departement avec affectation par evenement
- Filtres evenements : recherche textuelle, filtre par mois (defaut : mois courant)
- Infrastructure de tests Vitest avec couverture V8
- Tests unitaires : permissions RBAC (10 tests), helpers API (9 tests)
- Tests API : departments (9 tests), events (8 tests), planning (8 tests)
- Mocks reutilisables pour Prisma et sessions d'authentification
- Migrations Prisma : migration baseline `0_init` (remplace `db push`)
- Scripts npm : `test`, `test:watch`, `test:coverage`, `db:migrate`, `db:migrate:deploy`, `db:reset`
- CI GitHub Actions : execution des tests apres le typecheck

### Ameliore

- Champ date des evenements en datetime-local (date + heure)
- Affichage date+heure dans le tableau des evenements
- Correction du decalage timezone (UTC vs heure locale) dans les formulaires
- Variants Button (edit, info) et corrections DataTable
- Documentation base de donnees : workflow migrations dev/production
- Roadmap : items responsive (R1-R4) marques comme implementes

### Corrige

- Variable inutilisee dans cron/reminders (finding CodeQL)

## [v0.4.0] - 2026-03-03

### Ajoute

- Evenements recurrents : creation hebdomadaire/bi-hebdomadaire/mensuelle avec gestion par serie
- Date/heure limite de planification : echeance par evenement, lecture seule apres echeance
- Duplication d'un planning d'un evenement vers un autre
- Taches/affectations par departement (TaskPanel dans la grille planning)
- Vue calendrier des evenements avec grille mensuelle interactive
- Historique des modifications (audit log) avec page admin dediee
- Notifications in-app avec cloche, badge et polling (marquer tout comme lu)
- Notifications email (rappels J-3, J-1) via nodemailer et route cron
- Super Admin global (`isSuperAdmin` sur User) avec bypass permissions
- Onboarding nouvelle eglise (formulaire admin avec invitation)
- Statistiques par departement : taux de presence, services par membre, graphiques recharts
- Filtre par mois dans le selecteur d'evenements
- Selecteur de mois direct dans la vue planning mensuelle
- Export PDF du planning mensuel
- Rate limiting sur les API routes
- Logs structures avec pino
- PWA : manifest, service worker (network-first), installation mobile
- Responsive mobile R3 : vues metier adaptees (cartes, grilles)

### Ameliore

- Calendrier et date pickers harmonises avec le theme ICC (accent-color violet, en-tetes colores, hover/today)
- Inputs date/month/select alignes sur le design system (border-2, rounded-lg, shadow-sm, focus ring violet)
- Navigation mois avec icones SVG et boutons tactiles (min 44x44px)
- Sidebar : section Evenements avec sous-menu Liste + Calendrier

## [v0.3.1] - 2026-03-01

### Ajoute

- Changement de ministere lors de l'edition d'un departement (Select ministere + validation scope)

## [v0.3.0] - 2026-03-01

### Ajoute

- Permission `departments:manage` pour le role MINISTER (gestion des departements de son ministere)
- Chargement du `ministryId` dans la session utilisateur
- Scoping des departements par ministere pour les Ministres (page admin + API)
- Verification du scope ministere dans les API departments (POST/PATCH/PUT/DELETE)
- Icone bulle de discussion pour le statut EN_SERVICE_DEBRIEF

### Corrige

- Contraste EN_SERVICE_DEBRIEF : couleur jaune remplacee par violet (PlanningGrid, MonthlyPlanningView, StarView)
- Couleurs jaunes remplacees par violet dans la vue STAR evenement
- Overflow de la liste departements sur la page admin evenement (scroll vertical)

## [v0.2.1] - 2026-03-01

### Corrige

- Bus error au build : import dynamique de `cookies` dans `getCurrentChurchId()` (evite le chargement de `next/headers` au niveau module)

## [v0.2.0] - 2026-03-01

### Ajoute

- Bootstrap SUPER_ADMIN : les utilisateurs declares dans `SUPER_ADMIN_EMAILS` peuvent creer la premiere eglise sans role prealable
- Auto-promotion : creation d'une eglise assigne automatiquement tous les SUPER_ADMIN existants
- Selecteur d'eglise : dropdown dans le header pour les utilisateurs multi-eglises, persistance via cookie
- Helper `isSuperAdmin()` pour verifier le statut Super Admin par email
- Helper `getCurrentChurchId()` pour resoudre l'eglise active (cookie avec fallback)
- Endpoint POST `/api/current-church` pour changer d'eglise courante
- Composant `ChurchSwitcher` (dropdown masque si une seule eglise)
- Auto-generation du slug d'eglise depuis le nom (avec possibilite de modification manuelle)

## [v0.1.0] - 2026-02-28

### Ajoute

- Schema Prisma complet : eglises, utilisateurs, roles, ministeres, departements, membres, evenements, plannings
- Authentification Google OAuth via NextAuth v5
- Systeme RBAC avec 5 roles et matrice de permissions
- Dashboard de planning avec grille interactive et auto-save
- Vue mensuelle du planning
- Sidebar unifiee avec 3 sections accordion (Departements, Evenements, Administration)
- Interface admin : CRUD eglises, utilisateurs, ministeres, departements, membres, evenements
- API REST complete avec validation Zod
- Middleware de protection des routes
- Seed de donnees ICC Rennes (7 ministeres, departements, membres, evenements)
- Architecture multi-tenant par eglise
- Composants UI : Button, Input, Select, Modal, DataTable, BulkActionBar
- Export PDF des plannings
- Page evenements avec selecteur et vue par departement
- Auto-promotion Super Admin par email (`SUPER_ADMIN_EMAILS`)
- Affectation ministere/departements aux roles MINISTER et DEPARTMENT_HEAD depuis l'interface admin
- Composant `CheckboxGroup` pour la selection multiple de departements
- Endpoint PATCH `/api/users/[userId]/roles` pour modifier les affectations
- Badges enrichis affichant le ministere/departements associes avec bouton d'edition
- Helper `requireAnyPermission()` pour verifier plusieurs permissions
- Helper `getUserDepartmentScope()` pour le filtrage par departement selon le role
- Permission `members:manage` accordee aux roles MINISTER et DEPARTMENT_HEAD
- CI GitHub Actions : typecheck et validation de version sur tags
- Dependabot : mises a jour hebdomadaires npm et GitHub Actions (minor/patch uniquement)
- Affichage de la version dans le footer (depuis `package.json`)
- Script `typecheck` dans package.json
- Guide de deploiement production (Debian, Traefik, systemd)

### Corrige

- Cascade de suppression des roles avec departements associes (FK constraint MySQL)
- Permissions des liens sidebar admin (alignees avec les permissions des pages)
