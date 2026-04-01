# Changelog

Toutes les modifications notables de ce projet sont documentees ici.
Format inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Ce projet suit [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publie]

## [v0.18.2] - 2026-04-01

### Technique

- Upgrade Prisma 6 → 7 (driver adapter MariaDB, `prisma.config.ts`, client généré dans `src/generated/prisma/`)

## [v0.18.1] - 2026-04-01

### Technique

- Upgrade Node.js 20 → 22 (CI + `.nvmrc`)
- Upgrade Next.js 15 → 16 (`src/middleware.ts` → `src/proxy.ts`)

## [v0.18.0] - 2026-03-31

### Nouveautés

- Calendrier : vue multi-mois avec sélecteurs de période (jusqu'à 12 mois simultanés)
- Calendrier : export PDF (impression), téléchargement PNG et copie dans le presse-papiers
- Discipolat : toggle global « Tous / Mes disciples » persistant sur les 3 onglets (Relations, Appel, Statistiques) pour les admins/secrétaires qui sont aussi FD

### Correctifs

- Tâches : erreur 400 lors de l'affectation à un membre dont le statut avait changé entre deux sessions

## [v0.17.5] - 2026-03-31

### Correctifs

- Pages `/admin/events/[eventId]` et `/admin/events/[eventId]/report` : `notFound()` au lieu de `ApiError(404)` quand l'eventId est invalide (corrige l'erreur 500 en production)

## [v0.17.4] - 2026-03-31

### Correctifs

- Cascade FK manquante lors de la suppression d'événements en lot : supprime désormais `DiscipleshipAttendance`, `EventReport`, `TaskAssignment` et `AnnouncementEvent` avant `event.deleteMany`

## [v0.17.3] - 2026-03-28

### Améliorations

- Gestion des membres : vue cartes responsive (1/2/3 colonnes), filtres persistants, tri alphabétique, sélection groupée

## [v0.17.2] - 2026-03-28

### Nouveautés

- Statistiques : sélection de période personnalisée (champs Du / Au) en plus des périodes prédéfinies (1, 3, 6, 12, 24 mois)

### Correctifs

- Saisie planning : l'EventSelector n'affiche plus que les événements auxquels le département est programmé
- Admin événements : refonte UX — tri ascendant, filtres persistants, édition de la récurrence, vue carte, gestion des séries

## [v0.17.1] - 2026-03-28

### Correctifs

- Lint CI : remplacement du `useMemo([], [])` par un `useState` lazy initializer dans `EventSelector`

## [v0.17.0] - 2026-03-28

### Nouveautés

- Vue hebdomadaire : affichage des tâches par STAR (pills colorées), aligné sur la vue mensuelle
- Sélection d'événement en deux temps : select mois → select événement avec auto-sélection
- Types d'événement standardisés : Culte (violet), Prière (orange), Réunion (bleu), Formation (rouge), Autre (vert) — badge coloré partout
- Lien Statistiques transmet le département courant pour pré-sélection directe

### Améliorations

- Vue hebdomadaire et mensuelle : carte élargie (`max-w-2xl`), noms STAR en gras
- Vue hebdomadaire : zone notice conditionnelle, bouton "Ajouter" dans la section membres, boutons d'action exclus des captures
- Vue hebdomadaire : bouton Supprimer pour les notices existantes
- Navigation dashboard : renommage des boutons — Saisie, Vue semaine, Vue mois
- Admin événements : saisie du type via select à la place d'un champ texte libre

### Correctifs

- Calendrier : correction du décalage des événements du dimanche (bug timezone UTC vs local)

## [v0.16.1] - 2026-03-28

### Améliorations

- Vue hebdomadaire : design aligné sur la vue mensuelle (header violet, cartes avec bloc date, notices intégrées par département)
- Vue hebdomadaire : ajout des boutons export — copier image, télécharger PNG, export PDF
- Vue hebdomadaire : bouton "Semaine" ajouté dans la navigation principale du dashboard

## [v0.16.0] - 2026-03-28

### Nouveautés

- Notice de service par département : les responsables peuvent rédiger une notice affichée sur la nouvelle vue planning hebdomadaire (#150)
- Nouvelle vue "Semaine" dans le dashboard : navigation semaine par semaine, événements groupés par jour, notices éditables inline

### Correctifs

- Artifact de déploiement : inclusion complète de `node_modules` — fin des erreurs de dépendances transitives Prisma manquantes (#155)

### Dépendances

- Bump actions/checkout 4.2.2 → 4.3.1 (#148)
- Bump actions/setup-node 4.1.0 → 4.4.0 (#147)
- Bump appleboy/ssh-action 1.0.3 → 1.2.5 (#146)
- Bump dépendances npm mineures/patch (#149)

## [v0.15.5] - 2026-03-28

### Améliorations

- Message WhatsApp du compte rendu reformaté : zéro émoji, en-têtes en gras, structure lisible centrée sur les informations (#151)

## [v0.15.4] - 2026-03-28

### Correctifs

- Inclut tout `node_modules/@prisma/*` dans l'artifact (fix complet après `@prisma/engines` seul ne suffisait pas — `@prisma/debug`, `@prisma/internals` etc. sont aussi requis par le CLI)

## [v0.15.3] - 2026-03-28

### Correctifs

- Inclut `@prisma/engines` dans l'artifact de déploiement pour corriger `Cannot find module '@prisma/engines'` lors de `prisma migrate deploy`

## [v0.15.2] - 2026-03-28

### Documentation

- Ajoute `SECURITY.md` : politique de divulgation responsable, périmètre, contact et délais de traitement

## [v0.15.1] - 2026-03-28

### Sécurité

- Restreint l'accès au détail des demandes internes (`GET /api/requests/[id]`) aux seuls propriétaires, membres du département assigné et gestionnaires (#132)
- Restreint l'accès au détail des annonces (`GET /api/announcements/[id]`) aux seuls propriétaires et gestionnaires (#133)
- Enforce le scope rôles : `MINISTER` requiert un ministère, `DEPARTMENT_HEAD` requiert au moins un département (#134/#135)
- Valide les références `departmentId`/`ministryId` cross-tenant dans `createDemand` ; utilise le payload fusionné effectif lors d'une approbation (#136)
- Supprime la journalisation du stderr mysqldump/mysql (risque d'exposition SQL) (#137)
- Chiffrement SSE-AES256 sur les uploads de backup S3 (#138)
- Supprime `scripts/deploy.sh` (build depuis les sources en production, contourne le CI) ; aligne `docs/production.md` sur le déploiement artifact-only (#139)
- Documente la limite single-instance du rate-limit et l'hypothèse proxy (#140)
- Échappe le HTML dans les emails de rappel ; masque les adresses email dans les logs d'échec SMTP (#142)

### Tests

- Ajoute test `ZodError → HTTP 400` dans `api-utils.test.ts` (#141)
- Ajoute tests de scope rôles (MINISTER, DEPARTMENT_HEAD, cross-church, escalade) (#141)

## [v0.15.0] - 2026-03-27

### Sécurité

- **Validation cross-tenant** : les demandes exécutables, annonces et routes de planification valident désormais que toutes les références (departmentIds, eventIds, ministryId) appartiennent au même `churchId` (#117, #118, #119)
- **Gestion des rôles** : scoping du périmètre de département par église dans les vérifications d'autorisation (#119)
- **Erreurs de validation** : les erreurs Zod retournent désormais 400 avec détails par champ au lieu de 500 (#121)
- **Logs sanitisés** : suppression des stack traces et données sensibles dans les logs d'erreur (#125)
- **Tokens OAuth** : confirmé non exposés dans la session client (#128)

### CI/CD

- Déploiement conditionné au succès complet du CI (`workflow_run`) (#122)
- Actions GitHub épinglées à des SHA immuables (supply chain) (#123)
- Build immutable en CI (Next.js standalone), déploiement sans build sur le serveur (#124)

### Configuration

- Docker : port MariaDB bindé sur `127.0.0.1` uniquement (#129)
- `.env.example` : placeholders explicitement non utilisables (#129)
- Documentation systemd hardening et sécurité bucket S3 (#127, #129)

### Tests

- +29 tests sur les routes sensibles : cron backup/reminders, admin backups/restore, requests, announcements (105 → 134 tests) (#126)

## [v0.14.1] - 2026-03-26

### Modifie

- **Vue STAR en service** : header indigo apaisé, fond clair, départements actifs uniquement, départements vides regroupés en ligne compacte
- **Planning mensuel** : badges rôle en outline inline après le nom, badge Debrief en violet plein, tâches rendues individuellement

## [v0.14.0] - 2026-03-26

### Nouveautes

- **Vue STAR en service redessinée** : header bicolore (violet + jaune), grille violet, badges Debrief/Remplaçant, optimisée pour export paysage WhatsApp (#116)
- **Planning mensuel redessiné** : blocs date proéminents, header violet, badges tâches et debrief, export image/PDF pour WhatsApp (#115)
- **Demande ajout événement enrichie** : sélection des départements, récurrence hebdomadaire, offset deadline (#116)
- **Demande modification événement** : champs type, date et deadline ajoutés (#116)
- **Demande modification planning** : réécriture en gestion des départements en service (#116)

## [v0.13.0] - 2026-03-25

### Nouveautes

- **Système de demandes unifié** : formulaire unique pour soumettre annonces et demandes au secrétariat (#105)
- **Nouveaux types de demandes** : ajout/modification/annulation d'événement, modification de planning, demande d'accès (#105)
- **Exécution automatique** : les demandes approuvées sont exécutées automatiquement (création d'événement, modification de planning, attribution de rôle) (#105)
- **Fonctions de département personnalisées** : les admins peuvent créer et supprimer des fonctions en plus des fonctions système (#105)

### Modifie

- Migration `ServiceRequest` → `Request` (modèle unifié avec payload JSON) (#105)
- Migration `DepartmentFunction` enum → `String?` (fonctions flexibles) (#105)
- Sidebar : section "Annonces" renommée "Demandes" avec nouvelles routes (#105)
- Pages annonces absorbées dans le système de demandes unifié (#105)

### Corrige

- Connexion super admin au premier démarrage (pas d'église configurée) (#105)
- Sélecteur "Dimanches de diffusion" restauré dans le formulaire d'annonce (#105)
- Attribution des rôles transverses (Admin, Secrétaire, Faiseur de Disciples) depuis la page Accès & rôles (#112)
- Migration Prisma idempotente pour production (tables existantes via db push) (#105)

## [v0.12.6] - 2026-03-24

### Corrections

- Deploy : ajout de `prisma generate` manquant dans le workflow de déploiement — corrige le crash de création d'événements après migration N-N (#102)

## [v0.12.5] - 2026-03-23

### Corrections

- Accès : les nouveaux utilisateurs sans rôle apparaissent dans la page "Accès & rôles" (#101)

## [v0.12.4] - 2026-03-23

### Nouveautes

- Discipolat : gestion complete pour admins et secretariat — acces a toutes les lignees, modification du FD actuel et du premier FD (#100)
- Discipolat : le secretariat obtient la permission `discipleship:manage`
- Discipolat : filtre "Mes disciples" pour les admins/secretaires cumulant le role FD
- Discipolat : un admin/secretaire avec le role FD conserve la vue admin complete

## [v0.12.3] - 2026-03-23

### Corrections

- TypeScript : correction des erreurs de lint apres la migration N-N membres/departements (#99)
- Remplacement de toutes les references `member.department` par `member.departments` dans les routes API et composants
- Mise a jour des mocks de tests pour reflechir le nouveau schema N-N

## [v0.12.2] - 2026-03-22

### Corrections

- Mobile : touch targets agrandis sur la sidebar, les tabs et les boutons d'action
- Mobile : labels bottom nav passes de 10px a 11px, padding bas ajuste
- Mobile : grilles stats responsive (presence, integration) sur les comptes rendus
- Mobile : export Excel layout vertical avec inputs pleine largeur
- Mobile : modales de la page Acces en bottom-sheet
- Mobile : titres d'annonces tronques (line-clamp)
- Mobile : vue cartes pour les tables Relations et Statistiques du discipolat
- Mobile : selecteur de periode discipolat en layout vertical

## [v0.12.1] - 2026-03-22

### Documentation

- Tour guide : ajout des etapes Membres, Annonces, Discipolat, Comptes rendus
- Tour guide : visibilite par role (REPORTER voit les CR, DISCIPLE_MAKER voit le discipolat)
- Tour guide : renommage Administration→Configuration, Departements→Planning
- Guide utilisateur : description enrichie des comptes rendus (orateur, export Excel)
- API docs : champs speaker/messageTitle + endpoint export Excel
- Database docs : colonnes speaker et messageTitle sur event_reports
- Roadmap : items export Excel et champs orateur/titre coches

## [v0.12.0] - 2026-03-22

### Ajouts

- Export Excel des statistiques hebdomadaires des cultes avec selection de periode
- Champs orateur et titre du message dans les comptes rendus d'evenements
- Endpoint API `GET /api/events/reports/export` avec protection contre l'injection de formules Excel

## [v0.11.3] - 2026-03-22

### Securite

- Routes unitaires membres/departements : validation cross-tenant sur departmentId et ministryId cibles
- Comptes rendus : validation des departmentIds de section contre l'eglise de l'evenement
- Duplication de planning : verification que l'evenement cible appartient a la meme eglise
- Discipolat PATCH : enforcement du scope DISCIPLE_MAKER + validation cross-tenant du nouveau FD
- Discipolat POST : validation de tous les memberIds (disciple, FD, firstMaker) contre l'eglise
- Suppression membre : cascade complete incluant discipleship (unitaire et bulk)
- Middleware : exception /api/cron/* pour authentification par bearer token

### Tests

- 25 nouveaux tests de securite multi-tenant (105 total)
- Couverture : bulk ops, routes unitaires, discipolat, rapports, duplication planning

## [v0.11.2] - 2026-03-22

### Securite

- Bulk PATCH destination : validation que les champs churchId/ministryId/departmentId cibles appartiennent a la meme eglise (ministeres, departements, membres)
- Planning PUT : verification que tous les memberIds appartiennent au departement cible
- Service requests POST : validation des references departmentId et ministryId contre l'eglise specifiee
- Service requests PATCH : application stricte du owner read-only (blocage de toute modification, pas seulement le statut)

## [v0.11.1] - 2026-03-22

### Securite

- Coherence cross-tenant event↔departement : verification que le departement appartient a la meme eglise que l'evenement (planning GET/PUT, event-departments POST/DELETE)
- Operations bulk : validation que TOUS les IDs appartiennent a la meme eglise (events, departments, members, ministries PATCH)
- Suppression de roles privilegies : blocage pour les non-super-admins (SUPER_ADMIN, ADMIN, SECRETARY)
- Service-requests canManage : scope du calcul de permissions a l'eglise demandee
- Bypass deadline planning : scope de la verification des roles a l'eglise de l'evenement

## [v0.11.0] - 2026-03-22

### Securite

- Autorisation multi-tenant scopee par eglise sur toutes les routes API (requireChurchPermission + resolveChurchId)
- Server components scopes a l'eglise active via getCurrentChurchId (19 pages)
- Rate limiting active sur les routes d'authentification et de mutation (3 presets : AUTH, MUTATION, SENSITIVE)
- Tests de securite : 36 tests couvrant l'isolation multi-tenant, le rate limiting, et le rejet cross-tenant

### Ajoute

- Audit logging systematique sur tous les endpoints de mutation (~50 operations, 25 fichiers)
- Standardisation des actions d'audit : CREATE, UPDATE, DELETE
- churchId ajoute aux logs d'audit du planning

### Corrige

- Suppression d'evenements : resolution de la contrainte FK en supprimant les enregistrements dependants dans l'ordre correct
- Routes discipolat : migration de prisma.auditLog.create direct vers le helper logAudit

## [v0.10.0] - 2026-03-21

### Modifie

- Renommage de l'application PlanningCenter en **Koinonia** (grec : communion, partage)
- Repo GitHub renomme en `iccbretagne/koinonia`
- Mise a jour de tous les fichiers : package.json, metadata, UI, PWA, emails, deploiement, documentation
- Utilisateur systeme et dossier de deploiement renommes (`planning` → `koinonia`)
- README reecrit pour refleter la vision elargie de l'application

## [v0.9.0] - 2026-03-21

### Ajoute

- Module Discipolat :
  - Role `DISCIPLE_MAKER` avec permissions `discipleship:view`, `discipleship:manage`, `discipleship:export`
  - Modeles `Discipleship` et `DiscipleshipAttendance` (schema Prisma)
  - Champ `trackedForDiscipleship` sur les evenements
  - API REST : `/api/discipleships` (CRUD), `/api/discipleships/attendance` (appel), `/api/discipleships/stats`, `/api/discipleships/export` (Excel)
  - Tableau de bord `/admin/discipleship` avec 3 onglets : Relations, Appel, Statistiques
  - Section "Discipolat" dans la sidebar, visible uniquement aux utilisateurs ayant `discipleship:view`
  - Onglet Appel : selection d'evenement (mois glissant, tri chronologique, selection automatique sur l'evenement le plus proche), presences groupees par FD, sauvegarde via PUT
  - Export Excel : feuille statistiques + feuille detail presences
- Comptes rendus d'evenements :
  - Modeles `EventReport` et `EventReportSection` (schema Prisma)
  - Flags `reportEnabled` et `statsEnabled` sur les evenements
  - API REST : `/api/events/[eventId]/report` (GET/PUT)
  - Page de saisie `/admin/events/[eventId]/report` avec sauvegarde auto (debounce)
  - Statistiques par departement (Accueil, Integration, Sainte-Cene) avec champs configurables
  - Tableau de bord `/admin/reports` avec liste et onglet statistiques agregees par mois
- Role `REPORTER` :
  - Permissions `events:view`, `reports:view`, `reports:edit`
  - Acces en lecture/ecriture aux comptes rendus sans droits d'administration
  - Toggle d'attribution dans la page Acces & roles
- Page Acces & roles (`/admin/access`) :
  - Onglet "Roles" : attribution des ministres et responsables de departement (principal/adjoint via `isDeputy`)
  - Onglet "Comptes rendus" : toggle REPORTER par utilisateur
  - Remplacement du bouton "Ajouter un role" de la page Utilisateurs
- Reorganisation du menu sidebar :
  - 6 sections : Planning, Evenements (Liste, Calendrier, Gestion, CR), Membres, Annonces, Discipolat, Configuration
  - Visibilite conditionnelle par permissions (REPORTER ne voit pas Planning)
  - BottomNav mobile adapte (Planning, Evenements, Membres)
- Configuration evenement : toggle "Suivre les presences pour le discipolat" sur la page de detail
- Configuration evenement : toggles "Compte rendu" et "Statistiques" sur la page de detail
- Bouton "Configurer" (renomme depuis "Dep. service") sur la liste des evenements admin
- Modale contextuelle par action (remplace la checkbox serie globale)
- Export des comptes rendus :
  - Export PDF (jsPDF) avec stats par departement, pagination et footer auteur
  - Copie message WhatsApp formate (gras, emojis, stats typees par departement)
- Filtres sur la liste des comptes rendus : mois, type d'evenement, statut, recherche textuelle

### Ameliore

- Boutons Retour en haut/bas de la page CR, coherence couleurs charte ICC
- Liaison compte utilisateur / membre STAR desormais independante de l'attribution de role
- Interface admin membres : colonne "Compte" et bouton "Lier" pour liaison directe sans flux de demande
- Page profil `/profile` : visualisation et demande de liaison STAR pour l'utilisateur connecte
- Recherche membres et utilisateurs insensible a la casse
- Guide utilisateur : ajout de l'onglet REPORTER avec matrice d'acces

### Corrige

- Guards de permission manquants sur `/admin/audit-logs` et `/admin/churches/onboard`
- Permission `reports:edit` separee de `reports:view` pour securiser l'ecriture des CR

## [v0.8.1] - 2026-03-18

### Corrige

- Motif de refus (`reviewNotes`) desormais visible par le demandeur dans "Mes annonces"
- `tsconfig.tsbuildinfo` desindexe de git (etait deja dans `.gitignore`)

### Ameliore

- ESLint configure (`eslint-config-next`) avec script `npm run lint`
- TypeScript : activation `noUnusedLocals` + `noUnusedParameters`
- `PlanningGrid` : etats d'erreur visibles (`fetchError` / `saveError`) en remplacement des `console.error` silencieux
- CI : `npm run lint` ajoute dans le pipeline
- Dependances : `@types/node` 25.3.5 → 25.5.0, `vitest` + `@vitest/coverage-v8` 4.0.18 → 4.1.0

## [v0.8.0] - 2026-03-18

### Ajoute

- Module Annonces et Demandes de service :
  - Soumission d'annonces par les referents (`/announcements/new`) avec canaux Interne et/ou Externe
  - Generation automatique de `ServiceRequest` en transaction lors de la soumission (DIFFUSION_INTERNE, RESEAUX_SOCIAUX, VISUEL)
  - Dashboards operationnels dedies : Secretariat (`/secretariat/announcements`), Production Media (`/media/requests`), Communication (`/communication/requests`)
  - Demandes de visuels standalone (`/media/requests/new`)
  - Configuration des fonctions departementales (`/admin/departments/functions`)
  - Badge de notification dans la sidebar pour les demandes en attente
  - Lien parent-enfant `parentRequestId` entre demande VISUEL et son canal (DIFFUSION_INTERNE ou RESEAUX_SOCIAUX)
  - Bouton "Annuler" dans "Mes annonces" : le demandeur peut annuler ses propres annonces

### Corrige

- Annulation en cascade niveau 1 : annuler une `Announcement` annule automatiquement toutes ses `ServiceRequest` liees
- Annulation en cascade niveau 2 : refuser une demande `DIFFUSION_INTERNE` ou `RESEAUX_SOCIAUX` annule automatiquement la demande `VISUEL` enfant liee
- Synchronisation automatique du statut de l'annonce quand une SR parente change de statut (EN_COURS / TRAITEE / ANNULEE)

### Ameliore

- Statuts des demandes de service : badges colores (amber/blue/green/gray) a la place de simples icones
- Formulaire annonce : champ "Source" renomme en "Departement demandeur"

## [v0.7.4] - 2026-03-07

### Corrige

- Mobile : boutons de la page Utilisateurs qui débordaient hors du viewport (flex-wrap)
- Mobile : derniers items de la sidebar masqués par la BottomNav (padding-bottom)

### Documentation

- Ajout de la section Webcron dans docs/production.md (crontab et service externe)
- Ajout de CRON_SECRET dans .env.example et la checklist de production
- Roadmap mise à jour (guide utilisateur et déploiement production cochés)

## [v0.7.3] - 2026-03-06

### Ajoute

- Guide : zoom plein ecran au clic sur les captures d'ecran (modale avec fond sombre)

### Corrige

- Tour guide : correction du bouton "Terminer" qui ne desactivait pas le tour au premier clic

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
