# Tâches — Suivi de l'accueil des nouveaux arrivants

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/suivi-accueil-nouveaux-arrivants`
- [x] Migration Prisma générée (T1, T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter au schéma : les deux valeurs d'enum `WAITING_RECONTACT` /
      `WAITING_MISSION` sur `FamilyIntegrationStatus`, le nouvel enum
      `IntegrationContactConsent`, les champs `contactConsent`, `waitingFrom`, `waitingSince`,
      `lastRelanceAt` sur `FamilyIntegrationRequest`, et le modèle `IntegrationSettings`. Générer
      la migration `add_integration_waiting_states` (`npx prisma migrate dev`). Purement
      additive : aucune donnée existante à transformer.
      *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…_add_integration_waiting_states/`)*
- [x] **T2** — Compter les demandes `SUBMITTED` portant `assignedFamilyId` ou
      `assignedBergerId` non nul (script ou requête ponctuelle, à journaliser dans la PR).
      Écrire la migration corrective `fix_reopened_requests_status` qui les passe à `ASSIGNED`,
      en `--create-only` pour relire le SQL avant application, comme la spec 033 le fait pour ses
      migrations de données.
      *(fichier : `prisma/migrations/…_fix_reopened_requests_status/migration.sql`)*

### 2. Logique métier (services)

- [x] **T3** — Créer `family-state.ts` : extraire la machine à états du `switch` de
      `src/app/api/integration/requests/[id]/route.ts` en `computeFamilyTransitionData(current,
      action, payload, actor)`, fonction pure. Couvrir toutes les transitions existantes
      (`assign`, `contact`, `whatsapp`, `integrate`, `abandon`) à l'identique, puis ajouter les
      arcs `wait` (depuis `SUBMITTED` ou `CONTACTED`) et `resume` (vers `waitingFrom`, ou l'étape
      suivante si l'on distingue les deux). Ajouter `assertNoStaleAssignment(data)`.
      *(fichier : `src/modules/integration/services/family-state.ts`)*
- [x] **T4** — Dans `family-state.ts`, ajouter `computeReopenData(request, mode, history)` :
      `mode: "resume"` lit le statut précédant l'abandon via `getRequestHistory` (T6) et le
      restaure ; `mode: "restart"` repart à `SUBMITTED`, détache `assignedFamilyId` /
      `assignedBergerId`, et renvoie l'identifiant du berger à notifier de son dessaisissement.
      Traiter la réaffectation de famille (changement de `assignedFamilyId` sur une demande déjà
      affectée) de la même façon : renvoyer l'ancien berger à notifier.
      *(fichier : `src/modules/integration/services/family-state.ts`)*
- [x] **T5** [P] — Créer `family-history.ts` : `recordStatusChange({ userId, churchId, requestId,
      from, to, action })` encapsulant `logAudit` avec `details: { action, from, to }` (remplace
      la forme actuelle `{ action }` dans le route handler).
      *(fichier : `src/modules/integration/services/family-history.ts`)*
- [x] **T6** [P] — Dans `family-history.ts`, ajouter `getRequestHistory(requestId)` : lit
      `AuditLog` sur `entityType: "FamilyIntegrationRequest"` + `entityId`, joint l'auteur
      (`user.name`), renvoie la frise triée par `createdAt` croissant.
      *(fichier : `src/modules/integration/services/family-history.ts`)*
- [x] **T7** — Étendre `family-service.ts` : `getIntegrationSettings(churchId)` (lecture avec
      valeurs par défaut `recontactDelayDays: 60`, `missionDelayDays: 30` si la ligne n'existe pas
      encore) et `updateIntegrationSettings(churchId, data)`.
      *(fichier : `src/modules/integration/services/family-service.ts`)*
- [x] **T8** — Étendre `family-service.ts` : `runWaitingRelanceNotifications(appUrl)`, en miroir
      de `runInactivityNotifications`. Sélectionne les demandes `WAITING_RECONTACT` /
      `WAITING_MISSION` dont `COALESCE(lastRelanceAt, waitingSince)` dépasse le délai de l'état
      (lu via `getIntegrationSettings`), notifie tous les membres retournés par `getManagers`
      (déjà multi-département), et appelle `recordStatusChange`-like pour tracer la relance
      elle-même dans l'historique (action `"relance"`, `from === to`).
      *(fichier : `src/modules/integration/services/family-service.ts`)*
- [x] **T9** [P] — Ajouter `buildRelanceEmail(...)` sur le modèle de `buildInactivityEmail`
      (mêmes conventions : `churchName`, cible de la relance, lien, `appUrl`).
      *(fichier : `src/modules/integration/services/family-service.ts`)*
- [x] **T10** [P] — Ajouter `requireIntegrationSettingsAccess(churchId)` dans `auth.ts` : Super
      Admin, ou `members:manage`/`events:manage`, ou `DEPARTMENT_HEAD` sur un département de
      fonction `INTEGRATION` (réutiliser `getFunctionDepartmentIds` déjà utilisé par
      `family-service.ts`). Rejette explicitement un simple membre de l'équipe et un berger.
      *(fichier : `src/modules/integration/auth.ts`)*
- [x] **T11** — Mettre à jour `src/modules/integration/index.ts` pour exporter les nouvelles
      fonctions (`computeFamilyTransitionData`, `computeReopenData`, `assertNoStaleAssignment`,
      `recordStatusChange`, `getRequestHistory`, `runWaitingRelanceNotifications`,
      `buildRelanceEmail`, `getIntegrationSettings`, `updateIntegrationSettings`,
      `requireIntegrationSettingsAccess`) — dépend de T3–T10.
      *(fichier : `src/modules/integration/index.ts`)*

### 3. API (route handlers)

- [x] **T12** — Réécrire le `switch` de `PATCH /api/integration/requests/[id]` pour appeler
      `computeFamilyTransitionData`/`computeReopenData` (T3, T4) au lieu de la logique inline.
      Ajouter les actions `wait`, `resume`, `relance` au schéma Zod du body. Remplacer l'appel
      `logAudit` actuel par `recordStatusChange` (T5). Ajouter le paramètre `mode` sur `reopen`.
      Comportement inchangé pour les actions existantes (non-régression).
      *(fichier : `src/app/api/integration/requests/[id]/route.ts`)*
- [x] **T13** [P] — Créer `GET /api/integration/requests/[id]/history`, gardé par
      `requireIntegrationAccess`, appelant `getRequestHistory` (T6).
      *(fichier : `src/app/api/integration/requests/[id]/history/route.ts`)*
- [x] **T14** [P] — Créer `GET`/`PUT /api/integration/settings`, gardé par
      `requireIntegrationSettingsAccess` (T10), body Zod `{ recontactDelayDays:
      z.number().int().min(1).max(365), missionDelayDays: z.number().int().min(1).max(365) }`,
      sur le modèle de `src/app/api/audio/settings/route.ts`.
      *(fichier : `src/app/api/integration/settings/route.ts`)*
- [x] **T15** — Ajouter `contactConsent: z.enum(["NOW", "LATER"]).default("NOW")` au
      `createSchema` de `POST /api/integration/requests`, le répercuter dans le
      `prisma.familyIntegrationRequest.create`. Si `contactConsent === "LATER"`, créer la demande
      directement en `WAITING_RECONTACT` (`waitingFrom: "SUBMITTED"`, `waitingSince: now`) plutôt
      qu'en `SUBMITTED` — sinon elle apparaîtrait à tort dans la file à traiter.
      *(fichier : `src/app/api/integration/requests/route.ts`)*
- [x] **T16** — Brancher `runWaitingRelanceNotifications` dans le cron, à côté de
      `runInactivityNotifications`.
      *(fichier : `src/app/api/cron/route.ts`)*

### 4. UI

- [x] **T17** [P] — Formulaire public : ajouter le choix « Être contacté maintenant / Être
      recontacté plus tard » (radio, pas de case « aucun contact » — l'absence de soumission
      couvre ce cas), envoyé comme `contactConsent`.
      *(fichier : `src/app/rejoindre/[churchSlug]/JoinForm.tsx`)*
- [x] **T18** [P] — Dashboard : ajouter les filtres de statut `WAITING_RECONTACT` /
      `WAITING_MISSION`, un `Badge` « à relancer » sur les demandes en attente dépassant leur
      délai (calcul client à partir des données déjà chargées, ou champ dérivé renvoyé par l'API),
      et un `Badge` « adresse non rattachée » sur les demandes `SUBMITTED` sans
      `suggestedFamilyId`.
      *(fichier : `src/app/(auth)/integration/requests/IntegrationDashboard.tsx`)*
- [x] **T19** — Fiche demande : boutons contextuels `Mettre en attente` (choix
      recontact/mission via `Select`, avec `ConfirmModal`), `Reprendre le parcours`, `Consigner
      une relance` (`Modal` + `Textarea` pour la note), branchés sur les actions `wait`/`resume`/
      `relance` de T12. Bouton `Réouvrir` existant étendu au choix `resume`/`restart` (T4).
      *(fichier : `src/app/(auth)/integration/requests/[id]/RequestDetail.tsx`)*
- [x] **T20** — Frise d'historique : nouveau composant affichant les entrées de
      `GET .../history` (T13) — état de départ, état d'arrivée, date, auteur — insérée en bas de
      la fiche. Pas d'équivalent dans `src/components/ui/` (le seul composant réellement neuf de
      cette feature).
      *(fichiers : `src/app/(auth)/integration/requests/[id]/RequestHistoryTimeline.tsx`,
      intégré dans `RequestDetail.tsx`)*
- [x] **T21** [P] — Page réglages : deux `Input type="number"` (délai recontact, délai mission) +
      `Button` d'enregistrement, sur le modèle de `AudioSettingsClient.tsx`. Page serveur qui
      appelle `requireIntegrationSettingsAccess` avant de rendre le client component.
      *(fichiers : `src/app/(auth)/integration/parametres/page.tsx`,
      `src/app/(auth)/integration/parametres/IntegrationSettingsClient.tsx`)*
- [x] **T22** [P] — Ajouter le lien « Paramètres » vers `/integration/parametres` dans la
      navigation du module intégration, visible seulement si l'utilisateur passerait
      `requireIntegrationSettingsAccess` (même logique d'affichage conditionnel que les autres
      liens du module).
      *(fichier : `src/components/Sidebar.tsx`)*

### 5. Tests

- [x] **T23** — Tests de `computeFamilyTransitionData` : table complète des arcs existants
      (non-régression) + les six nouveaux (entrée `wait` depuis `SUBMITTED` et `CONTACTED`,
      `resume` vers chacun, `abandon` depuis chaque attente) ; refus de `wait` depuis tout autre
      état ; refus d'un berger sur `wait` depuis `SUBMITTED` ; acceptation du berger sur `wait`
      depuis `CONTACTED`.
      *(fichier : `src/modules/integration/services/__tests__/family-state.test.ts`)*
- [x] **T24** [P] — Tests de `computeReopenData` : `mode: "resume"` restaure le statut
      pré-abandon lu dans l'historique ; `mode: "restart"` détache famille et berger et renvoie
      l'ancien berger à notifier ; réaffectation de famille renvoie l'ancien berger à notifier.
      *(fichier : `src/modules/integration/services/__tests__/family-state.test.ts`)*
- [x] **T25** [P] — Test de `assertNoStaleAssignment` : rejette une donnée `SUBMITTED` portant
      une famille ou un berger.
      *(fichier : `src/modules/integration/services/__tests__/family-state.test.ts`)*
- [x] **T26** [P] — Tests de `getRequestHistory` : reconstitue plusieurs cycles attente → reprise
      → attente sans qu'aucun événement n'écrase le précédent.
      *(fichier : `src/modules/integration/services/__tests__/family-history.test.ts`)*
- [x] **T27** — Tests de la sélection des relances (fonction de calcul d'échéance extraite de
      `runWaitingRelanceNotifications`) : `lastRelanceAt` prime sur `waitingSince` ; chaque état
      utilise son propre délai (`recontactDelayDays` / `missionDelayDays`) ; une demande hors
      attente n'est jamais sélectionnée ; une relance qui vient d'être consignée sort de la
      sélection ; une demande dont le statut a changé sort définitivement de la sélection.
      *(fichier : `src/modules/integration/services/__tests__/family-service.test.ts`)*
- [x] **T28** [P] — Tests de `requireIntegrationSettingsAccess` : Admin et Secrétaire passent,
      responsable du département intégration passe, membre simple de l'équipe est refusé, berger
      est refusé.
      *(fichier : `src/modules/integration/__tests__/auth.test.ts`)*
- [x] **T29** [P] — Test du schéma Zod de `POST /api/integration/requests` : `contactConsent`
      absent du body vaut `"NOW"` (non-régression pour tout appelant existant) ; `"LATER"` crée
      directement une demande `WAITING_RECONTACT`.
      *(fichier : `src/app/api/integration/requests/__tests__/route.test.ts`)*
- [x] **T30** — Test de migration T2 : sur un fixture reproduisant l'état bâtard (`SUBMITTED` +
      `assignedFamilyId` non nul), vérifier que la ligne corrigée passe bien à `ASSIGNED` et
      qu'une ligne saine (`SUBMITTED` sans affectation) n'est pas touchée.
      *(fichier : `prisma/migrations/__tests__/fix_reopened_requests_status.test.ts` ou
      équivalent selon la convention de test de migration déjà en place dans le repo)*

## Écarts d'implémentation

Constatés pendant `/implement`, sans entorse à la spec :

- **Emplacement des tests** : `src/modules/integration/__tests__/` (convention du module), et non
  `services/__tests__/`. Le test de T29 porte sur les fonctions exportées par le module
  (`contactConsentSchema`, `initialRequestStatusData`) plutôt que sur le route handler.
- **T2 / T30** : pas d'accès à la base de production depuis l'environnement de développement — le
  comptage des demandes incohérentes est à faire avant déploiement. Aucune convention de test de
  migration n'existe dans le repo : les deux migrations ont été rejouées sur une MariaDB 10.11
  vierge avec un jeu de données reproduisant l'état incohérent (ligne corrigée en `ASSIGNED`,
  ligne saine intacte), puis `prisma migrate diff --exit-code` sans écart.
- **T8** : le cron ne journalise pas de relance dans l'historique — une alerte n'est pas une
  relance, et le journal exige un auteur. Seule la relance **consignée** par un membre (action
  `relance`) figure dans l'historique, conformément à la spec.
- **T10** : `requireIntegrationSettingsAccess` retient `events:manage` (Super Admin, Admin,
  Secrétaire) et non `members:manage`, que détient tout Ministre et tout Resp. département : sans
  cet ajustement, n'importe quel responsable de département aurait pu régler les délais.
- **T18 / T19** : `Badge` n'affiche qu'un compteur numérique ; les étiquettes « À relancer » /
  « Adresse non rattachée » réutilisent le style d'étiquette déjà présent dans le tableau de bord.
  Le choix du type d'attente est un groupe de boutons radio dans une `Modal`.
- **T22** : les liens de navigation du module sont construits dans `src/app/(auth)/layout.tsx`,
  pas dans `Sidebar.tsx` — le lien « Paramètres intégration » y est ajouté.
- **Ajouts mineurs** : l'email de confirmation et l'écran de succès du formulaire public
  s'adaptent au choix « plus tard » (ils promettaient un contact « très prochainement ») ; le
  libellé de `SUBMITTED` passe de « En attente » à « Demande reçue » pour ne pas se confondre avec
  les deux nouveaux états d'attente.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] `prisma migrate deploy` rejoué sur base vierge (MariaDB 10.11 locale) sans erreur, `migrate diff --exit-code` sans écart
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (voir couverture ci-dessous)
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec.md) | Couvert par |
|---|---|
| Formulaire : choix maintenant/plus tard, aucune trace si non rempli | T15, T17, T29 |
| Mise en attente uniquement depuis `SUBMITTED`/`CONTACTED` | T3, T12, T23 |
| Droit refusé au berger depuis `SUBMITTED`, accepté depuis `CONTACTED` | T3, T23 |
| Demande en attente sort de la file, apparaît dans la liste d'attente | T12, T18 |
| Reprise place à l'étape suivante selon le point d'entrée | T3, T4, T23, T24 |
| Abandon direct depuis un état d'attente | T3, T12, T23 |
| Historique visible sur la fiche (from/to/date/auteur, occurrences répétées) | T5, T6, T13, T20, T26 |
| Deux délais réglables indépendamment, par Admin et Resp. intégration | T7, T10, T14, T21, T28 |
| Alerte de relance après délai, cible précisée | T8, T18, T27 |
| Alerte visible par toute l'équipe | T8 (`getManagers`) |
| Relance consignée remet le décompte à zéro | T8, T12, T27 |
| Demande sortie d'attente ne relance plus jamais | T27 |
| Pas d'abandon automatique, quel que soit le nombre de relances | T8 (aucune logique d'abandon dans la sélection) |
| Réouverture retrouve l'état pré-abandon, ou détache si reprise de zéro | T4, T12, T24 |
| Invariant : aucune demande `SUBMITTED` avec famille/berger | T2, T25, T30 |
| Berger dessaisi informé (réaffectation ou reprise de zéro) | T4, T12 |

Les 16 critères d'acceptation de la spec sont couverts.
