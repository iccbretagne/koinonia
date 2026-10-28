# Tâches — Candidatures au service (fiche STAR)

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Trois lots sur la même branche (plan, « Découpage proposé ») ; la recette suit le lot 3.

## Prérequis

- [x] Branche créée : `feat/candidatures-service` (depuis `origin/main`)
- [x] **T0** — Valider `@react-pdf/renderer` avant tout le reste :
  - l'installer ;
  - rendre un PDF minimal dans une route de test locale (non commitée) ;
  - `npm run build` et `npm audit --omit=dev --audit-level=high` doivent passer ;
  - en cas d'échec, basculer sur `jspdf` côté serveur et le noter dans `plan.md`.

  *(fichiers : `package.json`, `package-lock.json`, `next.config.ts` si `serverExternalPackages`)*
- [x] Migration Prisma générée (T2)

## Lot 1 — Socle : formulaire public, PVS, PDF

### 1. Données & migration

- [x] **T1** — Ajouter au schéma :
  - les enums `ServingApplicationStatus`, `ServingAssignmentStatus`, `MaritalStatus` ;
  - les modèles `ServingApplication`, `ServingAssignment`, `ServingSettings` ;
  - `Department.contactEmail` ;
  - les relations inverses sur `Church`, `Member` et `Department`.

  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration :
  - `npm run db:migrate -- --name serving_applications` ;
  - vérifier le SQL (index, `ON DELETE CASCADE` des affectations, `SET NULL` sur `memberId`).

  *(fichier : `prisma/migrations/*_serving_applications/migration.sql`)*
- [x] **T3** [P] — Ajouter la fonction de département `VIE_DES_STAR`, libellé « Vie des STAR
  (PVS) », et la référencer dans la vue d'ensemble des accès si les autres fonctions y sont.
  *(fichiers : `src/lib/department-functions.ts`, `src/lib/access-overview.ts`)*

### 2. Module, accès, services

- [x] **T4** — Créer le module `serving` :
  - manifeste (routes, `serving:manage` pour Super Admin et Admin, domaine de notification
    `serving`, `dependsOn: ["core", "planning"]`) ;
  - index ;
  - l'ajouter à `manifests.ts` ;
  - règle dependency-cruiser `no-serving-imports-other-modules` (sauf `storage`).

  *(fichiers : `src/modules/serving/manifest.ts`, `src/modules/serving/index.ts`,
  `src/lib/manifests.ts`, `.dependency-cruiser.cjs`)*
- [x] **T5** — Mettre à jour la matrice des permissions et sa documentation. *(fichiers :
  `src/core/__tests__/permissions.test.ts`, `CLAUDE.md`, `docs/auth.md`)*
- [x] **T6** [P] — Écrire les schémas Zod purs :
  - fiche publique : champs vides → `null`, booléen non répondu → `null`, formations PCNC en
    liste fermée, `consent` requis à `true`, piège `website` ;
  - réglages : `observationMonths` 1–12, `retentionMonths` 1–36, emails PVS ;
  - actions sur une candidature et sur une affectation.

  *(fichier : `src/modules/serving/schemas.ts`)*
- [x] **T7** — Écrire les fonctions d'état pures :
  - `canTransition` ;
  - `needsPvsAction` ;
  - `observationEndsAt` (ajout de mois, fin de mois bornée) ;
  - `observationPhase` (en cours, fin proche à J-14, échue) ;
  - `retentionDeadline` (trois cas de D5).

  *(fichier : `src/modules/serving/services/state.ts`)*
- [x] **T8** — Écrire les règles d'accès pures (`canManageApplications`, `isDepartmentLead`,
  `canViewApplication`, `canDecideAssignment`, `isOwnApplication`, `canEditSettings`) et les
  gardes `requireServingAccess`, `requireServingSettingsAccess`, `requireAssignmentDecision`
  (chargement des départements PVS, Super Admin, `rolePermissions`).
  *(fichiers : `src/modules/serving/services/access.ts`, `src/modules/serving/auth.ts`)*
- [x] **T9** [P] — Écrire `normalizePhoto` et `getPhotoStream` :
  - contrôle sur le format décodé, sans SVG ;
  - JPEG 600×800 sans métadonnées, `limitInputPixels` ;
  - stockage sous la clé `serving/<churchId>/<id>.jpg` via `@/modules/storage`.

  *(fichier : `src/modules/serving/services/photo.ts`)*
- [x] **T10** [P] — Écrire `getServingSettings` (valeurs par défaut sans ligne) et
  `updateServingSettings` (réglages et `contactEmail` des seuls départements PVS de l'église,
  journalisé).
  *(fichier : `src/modules/serving/services/settings.ts`)*
- [x] **T11** — Préparer les notifications, domaine `serving` :
  - destinataires PVS : comptes liés aux départements PVS, plus Admin ; à défaut, Admin ;
  - destinataires d'un département : `DEPARTMENT_HEAD` et `MINISTER` du ministère ; à défaut,
    Admin ;
  - copie institutionnelle à `contactEmail` (gabarit lien seul) ;
  - contenu limité à : prénom, nom, lien.

  *(fichier : `src/modules/serving/services/notifications.ts`)*
- [x] **T12** — Ajouter `"VIEW"` aux actions acceptées par `logAudit`. *(fichier :
  `src/lib/audit.ts`)*
- [x] **T13** — Écrire les services de candidature :
  - `submitApplication` (crée la candidature, stocke la photo, notifie le PVS) ;
  - `listApplications` (vue PVS et vue département, filtrées par droit) ;
  - `getApplication` (journalise `VIEW`) ;
  - `rejectApplication` (motif, `decidedAt`, renvois en attente résolus) ;
  - `linkMember`.

  *(fichier : `src/modules/serving/services/applications.ts`)*
- [x] **T14** [P] — Écrire `renderApplicationPdf` à partir du `FichePDF` de Jenny :
  - typé, sans `any` ;
  - « Non renseigné » pour un booléen nul ;
  - nom et logo de l'église ;
  - pied de page confidentiel.

  *(fichier : `src/modules/serving/services/pdf.tsx`)*

### 3. API (lot 1)

- [x] **T15** — Écrire la route publique `POST /api/serving/public/[churchSlug]`, dans cet ordre :
  1. 411/413 avant lecture du corps ;
  2. 404 si l'église est inconnue ou n'a pas de département PVS ;
  3. limite de débit ;
  4. champ piège (faux succès) ;
  5. Turnstile ;
  6. photo ;
  7. `submitApplication`.

  Avec son `contract.ts`.
  *(fichiers : `src/app/api/serving/public/[churchSlug]/route.ts`, `contract.ts`)*
- [x] **T16** — Écrire `GET /api/serving/applications`, `GET`/`PATCH
  /api/serving/applications/[id]` (actions `reject` et `link-member`), avec `resolveChurchId`
  pour l'objet identifié et les contrats.
  *(fichiers : `src/app/api/serving/applications/route.ts`, `[id]/route.ts`, `contract.ts`)*
- [x] **T17** [P] — Écrire `GET …/[id]/photo` (`no-store`) et `GET …/[id]/pdf` (journalisé
  `EXPORT`, `attachment`), ouverts à `canViewApplication` ou `isOwnApplication`.
  *(fichiers : `src/app/api/serving/applications/[id]/photo/route.ts`, `pdf/route.ts`,
  `contract.ts`)*
- [x] **T18** [P] — Écrire `GET`/`PUT /api/serving/settings` (`canEditSettings`). *(fichiers :
  `src/app/api/serving/settings/route.ts`, `contract.ts`)*
- [x] **T19** — Ajouter à la liste blanche le fichier qui envoie la copie institutionnelle, avec
  sa justification.
  *(fichier : `src/lib/__tests__/notifications-no-direct-email.test.ts`)*

### 4. UI (lot 1)

- [x] **T20** — Créer la page publique `/servir/[churchSlug]` :
  - en-tête avec le nom (et le logo) de l'église ;
  - `PublicFormUnavailable` si l'église est inconnue, n'a pas de département PVS ou si Turnstile
    est absent ;
  - `ServingForm` repris de `FicheForm`, sur `Field`/`Button` et les tokens ;
  - case de consentement et texte « qui verra ta fiche / combien de temps » ;
  - vérification mobile.

  *(fichiers : `src/app/servir/[churchSlug]/page.tsx`, `ServingForm.tsx`)*
- [x] **T21** — Ajouter le lien « Candidatures » au menu :
  - calculé dans le layout authentifié (gère les candidatures, ou responsable ou Ministre d'un
    département avec une affectation active) ;
  - libellés du fil d'Ariane.

  *(fichiers : `src/app/(auth)/layout.tsx`, `src/lib/navigation.ts`)*
- [x] **T22** — Créer la liste `/candidatures` : onglets « À traiter », « En cours », « Mes
  départements » et « Archivées », `DataTable` (cartes sur mobile), `StatusChip` par affectation,
  `EmptyState`. *(fichiers : `src/app/(auth)/candidatures/page.tsx`, `ApplicationsClient.tsx`)*
- [x] **T23** — Créer la fiche `/candidatures/[id]` :
  - photo et toutes les rubriques ;
  - « Télécharger le PDF » ;
  - historique des affectations ;
  - action PVS « Ne pas retenir » (`ConfirmModal` + motif).

  *(fichiers : `src/app/(auth)/candidatures/[id]/page.tsx`, `ApplicationDetail.tsx`)*
- [x] **T24** [P] — Créer la page `/candidatures/parametres` : durée d'observation, durée de
  conservation, adresse email de chaque département PVS.
  *(fichiers : `src/app/(auth)/candidatures/parametres/page.tsx`, `ServingSettingsForm.tsx`)*

### 5. Tests (lot 1)

- [x] **T25** [P] — Tester `state.ts` :
  - transitions ;
  - `needsPvsAction` ;
  - fin de mois (31 janvier + 1 mois) ;
  - J-14 et échéance ;
  - les trois cas de conservation.

  *(fichier : `src/modules/serving/services/__tests__/state.test.ts`)*
- [x] **T26** [P] — Tester `access.ts` sur des sessions fabriquées :
  - Admin oui, Secrétaire non ;
  - membre PVS lié (rôle STAR) et responsable PVS oui ;
  - responsable ou Ministre d'un autre département non ;
  - département affecté oui, sauf après renvoi ;
  - réglages : responsable PVS oui, membre PVS non ;
  - `isOwnApplication` (lien validé et affectation active).

  *(fichier : `src/modules/serving/services/__tests__/access.test.ts`)*
- [x] **T27** [P] — Tester les schémas : vides → `null`, booléen non répondu → `null`,
  consentement requis, formation hors liste refusée, date invalide refusée.
  *(fichier : `src/modules/serving/__tests__/schemas.test.ts`)*
- [x] **T28** [P] — Tester `photo.ts` (SVG et non-image refusés, PNG → JPEG sans EXIF) et
  `pdf.tsx` (le rendu produit un PDF non vide, booléen nul → « Non renseigné »).
  *(fichiers : `src/modules/serving/services/__tests__/photo.test.ts`, `pdf.test.ts`)*
- [x] **T29** — Tester `submitApplication` et `rejectApplication`, Prisma et storage mockés :
  piège sans effet, notification sans donnée sensible, `VIEW` journalisé par `getApplication`.
  *(fichier : `src/modules/serving/services/__tests__/applications.test.ts`)*

## Lot 2 — Circuit avec les départements

### 2. Services

- [x] **T30** — Écrire les services d'affectation :
  - `assignApplication` : un ou plusieurs départements de l'église ; refuse un département où la
    fiche liée est déjà ; résout les renvois en attente ; notifie les départements ;
  - `acceptAssignment` : crée ou lit le `Member`, puis `attachMember` injecté, puis
    `OBSERVATION` et `observationEndsAt` figé ; 409 de rattachement idempotent ;
  - `confirmAssignment` : notifie le PVS ;
  - `sendBackAssignment` : motif ; `detachMember` injecté seulement depuis `OBSERVATION` ;
    notifie le PVS.

  *(fichier : `src/modules/serving/services/assignments.ts`)*
- [x] **T31** [P] — Écrire `findMemberMatches` (même nom ou même email dans l'église, via
  `searchMembersChurchWide` injecté) et `listObservationMemberIds(churchId)`.
  *(fichier : `src/modules/serving/services/members.ts`)*
- [x] **T32** [P] — Écrire `getOwnApplication(userId, churchId)` et `toOwnApplicationView`, une
  vue réduite sans motifs, sans affectations en attente ou renvoyées, sans journal (D8).
  *(fichier : `src/modules/serving/services/own.ts`)*

### 3. API (lot 2)

- [x] **T33** — Écrire `POST /api/serving/applications/[id]/assignments` (`canManage`).
  *(fichiers : `src/app/api/serving/applications/[id]/assignments/route.ts`, `contract.ts`)*
- [x] **T34** — Écrire `PATCH /api/serving/assignments/[id]` avec les actions `accept`, `confirm`
  et `send-back`. La route injecte `attachMemberToDepartment` et `detachMemberFromDepartment`
  depuis `@/modules/planning`. *(fichiers : `src/app/api/serving/assignments/[id]/route.ts`,
  `contract.ts`)*
- [x] **T35** [P] — Écrire `GET /api/serving/applications/[id]/member-matches` (`canManage`) et
  `GET /api/serving/me` (vue réduite ou `null`).
  *(fichiers : `…/[id]/member-matches/route.ts`, `src/app/api/serving/me/route.ts`,
  `contract.ts`)*

### 4. UI (lot 2)

- [x] **T36** — Ajouter l'action PVS « Valider et affecter » à la fiche : `Modal` avec choix
  multiple de départements et suggestions de fiches existantes avec « Rattacher » ;
  réaffectation après renvoi. *(fichier : `src/app/(auth)/candidatures/[id]/AssignModal.tsx`)*
- [x] **T37** — Ajouter les actions responsable/Ministre à la fiche :
  - « Accueillir dans le département » ;
  - « Confirmer » ;
  - « Renvoyer au PVS » (motif obligatoire) ;
  - étape affichée (« Observation jusqu'au … », « Échue ») ;
  - actions en `BottomSheet` sous `md`.

  *(fichier : `src/app/(auth)/candidatures/[id]/AssignmentActions.tsx`)*
- [x] **T38** [P] — Ajouter la carte « Ma fiche de candidature » dans « Mon profil » : lecture
  seule, photo, PDF, départements et étape, mention « pour corriger, adresse-toi au PVS ».
  Affichée si le module est actif. *(fichiers : `src/app/(auth)/profile/page.tsx`,
  `OwnApplicationCard.tsx`)*
- [x] **T39** [P] — Afficher le badge « En observation » dans la liste des STAR : identifiants
  passés en prop depuis la page si le module est actif. *(fichiers :
  `src/app/(auth)/admin/members/page.tsx` et son composant client)*

### 5. Tests (lot 2)

- [x] **T40** — Tester `assignments.ts`, Prisma mocké et attach/detach injectés :
  - acceptation qui crée le `Member` puis rattache ;
  - acceptation rejouée après un 409 ;
  - `observationEndsAt` figé malgré un changement de réglage ;
  - refus avant accueil sans `detach`, renvoi depuis `OBSERVATION` avec `detach` ;
  - transitions invalides en 409 ;
  - département déjà porté refusé.

  *(fichier : `src/modules/serving/services/__tests__/assignments.test.ts`)*
- [x] **T41** [P] — Tester `own.ts` : la vue réduite n'expose ni `sentBackReason`, ni
  `rejectionReason`, ni affectation `PENDING` ou `SENT_BACK` ; `null` sans lien ou après renvoi
  total.
  *(fichier : `src/modules/serving/services/__tests__/own.test.ts`)*

## Lot 3 — Cycle de vie : rappels, relances, purge

- [x] **T42** — Écrire `runServingTasks(appUrl)` :
  - rappel « fin proche » à J-14 (une fois) ;
  - relance « échue » tous les 7 jours ;
  - avertissement PVS un mois avant l'effacement d'une candidature jamais traitée ;
  - purge des candidatures échues sans affectation active : ligne puis photo, nouvelle tentative
    de la photo, journal `DELETE` sans donnée personnelle.

  *(fichier : `src/modules/serving/services/lifecycle.ts`)*
- [x] **T43** — Déclarer la tâche cron `serving` (module `serving`, toutes les 60 minutes).
  *(fichier : `src/app/api/cron/route.ts`)*
- [x] **T44** — Tester `lifecycle.ts` :
  - rappel unique ;
  - relance espacée de 7 jours ;
  - avertissement unique ;
  - purge qui épargne une candidature à affectation active ;
  - photo supprimée après la ligne ;
  - journal sans donnée personnelle.

  *(fichier : `src/modules/serving/services/__tests__/lifecycle.test.ts`)*

## Documentation & garde-fous

- [x] **T45** — `npm run openapi` et commit de `docs/openapi.json`, couverture des préfixes vérifiée
  par `route-exhaustiveness.test.ts`.
  *(fichier : `docs/openapi.json`)*
- [x] **T46** [P] — Documenter :
  - section « Spécificités du module candidatures » dans `CLAUDE.md` et `docs/auth.md` ;
  - nouvelle fonction de département ;
  - entrée « Ajouté » du CHANGELOG ;
  - statuts de la spec (Implémentée) et du plan (Terminé).

  *(fichiers : `CLAUDE.md`, `docs/auth.md`, `CHANGELOG.md`, `specs/073-…/spec.md`, `plan.md`)*
- [x] **T47** — Préparer un jeu de données de dev : un département « Vie des STAR » et une
  candidature d'exemple, si le seed de dev couvre les autres fonctions.
  *(fichier : `prisma/seed-dev.ts`)*
  — Fait pour le département (`prisma/fixtures/dev-structure.ts`). Pas de candidature d'exemple :
  la photo est obligatoire et vit dans le stockage objet, que le seed ne remplit pas ; une
  candidature se crée en quelques secondes depuis `/servir/<slug>`.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` et `npm run lint:prisma-boundary` (seuil inchangé)
- [x] `npm run test`
- [x] `npm run build` (frontière client/serveur, `@react-pdf/renderer`) et `git checkout
  next-env.d.ts`
- [x] `npm audit --omit=dev --audit-level=high`
- [ ] Parcours manuel en local :
  1. soumission depuis un mobile ;
  2. fiche PVS ;
  3. PDF ;
  4. affectation à deux départements ;
  5. accueil (STAR planifiable, badge) ;
  6. renvoi d'un département ;
  7. réaffectation ;
  8. confirmation ;
  9. « Ma fiche » côté STAR.
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main` (après accord), déployée en recette pour la revue de Jenny
