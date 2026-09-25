# Tâches — Préférences de notifications par email

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0016-preferences-notifications-email.md` (à créer, T37)
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**, en deux lots livrés par PR successives vers la base
> `feat/preferences-notifications-email` (stratégie multi-PR, constitution §V). Dans chaque lot :
> migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables (fichiers
> indépendants).

## Prérequis

- [x] Branche de base créée et poussée : `feat/preferences-notifications-email` (contient
      `spec.md` et `plan.md`)
- [ ] Branche de lot créée depuis la base avant chaque lot : `feat/notif-prefs-lot1-mecanisme`,
      puis `feat/notif-prefs-lot2-coherence`
- [ ] MariaDB 10.11 locale disponible pour rejouer la migration

---

## Lot 1 — Le mécanisme et la page, à comportement constant

Aucun nouvel email n'est envoyé à la fin de ce lot : tout ce qui part par email aujourd'hui
continue de partir, mais passe désormais par le nouveau mécanisme et peut être coupé.

### 1.1 Données & migration

- [ ] **T1** — `NotificationEmailPreference` (clé composite `userId`+`domain`, `enabled`,
      `updatedAt`) et champ `Notification.domain` (nullable) + index `[userId, domain]`.
      *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Migration `add_notification_email_preferences` (`prisma migrate dev
      --create-only` puis complétée à la main) : crée la table, ajoute la colonne et l'index, puis
      rattache les notifications existantes à un domaine par préfixe de `type` (mapping détaillé
      au `plan.md`, § Modèle de données : `PLANNING_%`/`ABSENCE_%`/`OPENING_CLOSING_%` → `planning`,
      `CARE_%`/`APPOINTMENT` → `care`, `INTEGRATION_%` → `integration`, `ACCOUNTING_%` →
      `accounting`, `ROOM_%` → `rooms`, `MEDIA_FILE_%` → `media`, `ROLE_ASSIGNED`/`MEMBER_LINK_%`
      → `account`, `REQUEST_%`/`ANNOUNCEMENT_SHEET_%` → `requests`,
      `EMPLOI`/`STAGE`/`ALTERNANCE`/`JOB_%` → `jobs`). Ce rattachement ne sert qu'à la règle
      d'affichage (« l'utilisateur a déjà reçu une notification de ce domaine ») — aucune ligne de
      préférence n'est créée. *(fichier : `prisma/migrations/…_add_notification_email_preferences/`)*
- [ ] **T3** — Rejouer T1–T2 sur MariaDB locale avec les fixtures de dev ; vérifier par sondage
      que `notifications.domain` est correctement rattaché pour quelques types de chaque
      préfixe ; `prisma migrate diff --exit-code` sans écart.

### 1.2 Registre — domaines de notification

- [ ] **T4** — `NotificationDomainDescriptor` (`key`, `label`, `description`, `defaultEmail`,
      `visibleWith?: readonly Permission[]`) et `ModuleManifest.notificationDomains?`.
      *(fichier : `src/core/module-registry.ts`)*
- [ ] **T5** — `ModuleRegistry.collectNotificationDomains()` : agrège les domaines des modules
      actifs, `throw` si deux modules déclarent la même clé — miroir de `collectPermissions()`.
      *(fichier : `src/core/module-registry.ts`)*
- [ ] **T6** [P] — `src/core/notification-domains.ts` : `buildNotificationDomains(registry)` trie
      le résultat par point de code (miroir `buildRolePermissions`, `src/core/permissions.ts`).
      *(fichier nouveau)*
- [ ] **T7** — `notificationDomains = buildNotificationDomains(registry)` exposé à côté de
      `rolePermissions`. *(fichier : `src/lib/registry.ts`)*
- [ ] **T8** [P] — Domaines `planning` (« Planning et service », `defaultEmail: true`,
      `visibleWith: ["planning:view"]`) et `requests` (« Demandes », `defaultEmail: false`,
      `visibleWith: ["planning:view", "media:view"]`). *(fichier : `src/modules/planning/manifest.ts`)*
- [ ] **T9** [P] — Domaine `care` (« Suivi pastoral », `defaultEmail: true`, `visibleWith:
      ["care:qualify", "care:view"]`). *(fichier : `src/modules/care/manifest.ts`)*
- [ ] **T10** [P] — Domaine `integration` (« Intégration », `defaultEmail: true`, `visibleWith:
      ["members:manage", "events:manage"]`). *(fichier : `src/modules/integration/manifest.ts`)*
- [ ] **T11** [P] — Domaine `accounting` (« Comptabilité », `defaultEmail: true`, `visibleWith:
      ["accounting:submit", "accounting:view", "accounting:manage"]`).
      *(fichier : `src/modules/accounting/manifest.ts`)*
- [ ] **T12** [P] — Domaine `rooms` (« Salles », `defaultEmail: false`, `visibleWith:
      ["rooms:manage"]`). *(fichier : `src/modules/rooms/manifest.ts`)*
- [ ] **T13** [P] — Domaine `media` (« Médias », `defaultEmail: false`, `visibleWith:
      ["media:upload", "media:review"]`) — domaine ajouté suite à la découverte d'une notification
      existante non prévue par la spec (`MEDIA_FILE_*`, décision sur un fichier déposé) ; la spec
      sera amendée en T59 pour l'y ajouter. *(fichier : `src/modules/media/manifest.ts`)*
- [ ] **T14** [P] — Domaine `jobs` (« Emploi », `defaultEmail: true`, `visibleWith:
      ["jobs:view"]`) — les réglages détaillés existants (`JobNotificationSubscription`) restent
      la source de vérité pour les alertes de nouvelles offres (voir T30) ; `defaultEmail` ne
      couvre que ce que ce réglage ne couvre pas (voir T31). *(fichier : `src/modules/jobs/manifest.ts`)*
- [ ] **T15** [P] — Domaine `account` (« Compte et accès », `defaultEmail: false`,
      `visibleWith` omis = toujours affiché). *(fichier : `src/modules/core/manifest.ts`)*

### 1.3 Services communs

- [ ] **T16** — `src/lib/notification-preferences.ts` : `resolveEmailPreference({ globalEnabled,
      domainPreference, defaultEmail })` — fonction **pure** : global désactivé → `false` ; sinon
      préférence explicite du domaine si elle existe ; sinon `defaultEmail`. *(fichier nouveau)*
- [ ] **T17** — `getPreferencesView(userId)` dans le même fichier : rôles de l'utilisateur toutes
      églises confondues (`userChurchRole.findMany({ where: { userId } })` + `rolePermissions`) →
      domaines visibles (permission détenue **ou** notification déjà reçue sur ce domaine,
      index `[userId, domain]`) ; lit `NotificationEmailPreference` et
      `JobNotificationSubscription.email` pour `jobs` ; retourne `{ emailEnabled, hasEmail,
      domains: [{ key, label, description, enabled }] }`.
- [ ] **T18** — `updatePreferences(userId, { emailEnabled?, domains? })` dans le même fichier :
      upsert `(userId, "*")` et `(userId, domain)` pour chaque clé fournie ; `domains.jobs` écrit
      aussi `JobNotificationSubscription.email` (upsert si la ligne n'existe pas encore).
- [ ] **T19** — `src/lib/email.ts` : `appendPreferenceFooter(html, domainLabel)` — ajoute la
      phrase « Vous recevez cet email parce que… » et le lien `${APP_URL}/profile/notifications`.
- [ ] **T20** — `src/lib/notifications.ts` : `dispatchUserEmails(userIds, domain, content)` —
      charge l'email et les préférences des destinataires, filtre par `resolveEmailPreference`
      (T16), envoie via `sendEmail` avec le pied de page (T19), avale et journalise toute erreur
      SMTP (l'action métier ne doit jamais en dépendre). **Toujours appelée avec le client Prisma
      par défaut, jamais à l'intérieur d'une transaction ouverte** (I/O externe).
- [ ] **T21** — `src/lib/notifications.ts` : `createNotification`, `notifyUsersWithRole`,
      `notifyDeptMembers` prennent un `domain` **obligatoire** (le typage empêche de l'oublier) et
      un premier paramètre optionnel `tx?: Prisma.TransactionClient` pour l'écriture in-app
      (défaut : `prisma`) — nécessaire pour les sites du lot 2 qui créent aujourd'hui leur
      notification à l'intérieur d'une transaction (absence, checklist salles, planning,
      liaison membre ×2, offres d'emploi chercheurs). L'email, lui, se déclenche toujours via
      `dispatchUserEmails` (T20) en dehors de la transaction — à l'appelant de l'invoquer une fois
      la transaction validée, comme le fait déjà le fire-and-forget en comptabilité. Ajoute
      `notifyUsers(userIds, { domain, ... }, tx?)` pour les sites qui calculent déjà leurs
      destinataires. Documenter ce contrat en tête de fichier.

### 1.4 Migration des emails déjà envoyés à des utilisateurs

Chaque tâche remplace l'appel direct par le nouveau mécanisme, garde le contenu du gabarit
existant, et ajoute le pied de page (T19).

- [ ] **T22** — Comptabilité, paiement remis à `payment.request.submittedById` :
      `dispatchUserEmails`/`notifyUsers(..., { domain: "accounting" })`.
      *(fichier : `src/app/api/accounting/payments/[id]/route.ts`)*
- [ ] **T23** — Comptabilité, changement de statut à `req.submittedById` : même migration.
      *(fichier : `src/app/api/accounting/requests/[id]/route.ts`)*
- [ ] **T24** — Comptabilité, nouvelle demande : la notification in-app aux comptables
      (`accountants.map`) passe par `notifyUsersWithRole(..., { domain: "accounting" })` — **sans**
      email personnel pour l'instant, aucun n'existait avant (couvert au lot 2, T52). L'email vers
      `church.accountingEmails` est une adresse **institutionnelle** configurée par l'église, pas
      une préférence individuelle : il reste un `sendEmail` direct, ajouté à la liste blanche du
      test-gardien (T45). *(fichier : `src/app/api/accounting/requests/route.ts`)*
- [ ] **T25** — Rappels de service (orchestrateur actif) : `runReminders()` envoie aujourd'hui
      systématiquement un email à `member.email` et une notification in-app aux responsables de
      département — deux destinataires différents. Résoudre le compte utilisateur lié au membre
      (même requête que `cron/reminders/route.ts`, T26) : s'il existe, email et notification
      passent par `notifyUsers([userId], { domain: "planning", ... })` ; sinon (membre sans
      compte), l'email direct à `member.email` reste inchangé (liste blanche). La notification aux
      responsables de département reste distincte, migrée au lot 2 (T46-T57).
      *(fichier : `src/app/api/cron/route.ts`)*
- [ ] **T26** — Rappels de service (endpoint remplacé par l'orchestrateur ci-dessus selon le
      CHANGELOG, mais toujours exposé et couvert par des tests) : même migration que T25, pour ne
      pas laisser une voie d'envoi d'email à un compte utilisateur hors du mécanisme de
      préférence. *(fichier : `src/app/api/cron/reminders/route.ts`)*
- [ ] **T27** [P] — Suivi pastoral : les six fonctions (`notifyAssigneeAssigned`,
      `notifyAssigneeUnassigned`, `notifyReferentsHandback`, `notifyProtocoleToSchedule`,
      `notifyRequesterScheduled`, `notifyRequesterRejected`) passent par les helpers avec
      `domain: "care"` ; la branche « profil pastoral sans compte » de `notifyAssigneeAssigned`
      (email direct) reste inchangée (liste blanche). *(fichier : `src/modules/care/services/notifications.ts`)*
- [ ] **T28** [P] — Suivi pastoral, relances et inactivité MSDP : `domain: "care"`.
      *(fichiers : `src/modules/care/services/relances.ts`, `src/modules/care/services/followups.ts`)*
- [ ] **T29** [P] — Intégration : berger affecté/dessaisi, renvoi à l'équipe, relances et
      inactivité — `domain: "integration"`. *(fichier : `src/modules/integration/services/family-service.ts`)*
- [ ] **T30** [P] — Emploi, nouvelle offre : la notification in-app et l'email passent par
      `notifyUsers([sub.userId], { domain: "jobs", ... })` ; le filtre fin existant (`wantEmploi`/
      `wantStage`/`wantAlternance` pour la sélection des abonnés, `sub.email` pour l'email) reste
      appliqué **avant** l'appel — la préférence générale du domaine `jobs` (activée par défaut)
      s'ajoute par-dessus, elle ne le remplace pas. *(fichier : `src/app/api/jobs/route.ts`)*
- [ ] **T31** [P] — Emploi, relance de renouvellement d'offre : l'email à `offer.author.email` est
      aujourd'hui envoyé inconditionnellement, indépendamment de `JobNotificationSubscription`
      (qui gouverne un réglage différent — les alertes de nouvelles offres). Migré vers
      `domain: "jobs"` (défaut activé, T14) **sans** dépendre de `JobNotificationSubscription.email` :
      seuls l'interrupteur général et une éventuelle préférence explicite du domaine `jobs`
      s'appliquent, pour ne rien changer par défaut. *(fichier : `src/modules/jobs/services/lifecycle-service.ts`)*

### 1.5 API et page

- [ ] **T32** — `GET`/`PUT /api/notifications/preferences` : `GET` retourne `getPreferencesView`
      (T17) ; `PUT` valide avec Zod (`emailEnabled?: boolean`, `domains?: Record<string,
      boolean>`, clés limitées à celles visibles pour l'appelant — une clé inconnue ou non visible
      → 400) puis appelle `updatePreferences` (T18). `requireAuth()` uniquement, `userId` toujours
      pris de la session, jamais du corps. Déjà couvert par le préfixe `/api/notifications` du
      manifeste `core` (ADR-0012) — vérifier que `routes-exhaustivite.test.ts` passe sans
      modification. *(fichier : `src/app/api/notifications/preferences/route.ts`)*
- [ ] **T33** — Page `/profile/notifications` (Server Component) : charge `getPreferencesView`
      pour l'utilisateur connecté, rend le client. Déjà couvert par le préfixe `/profile` du
      manifeste `core`. *(fichier : `src/app/(auth)/profile/notifications/page.tsx`)*
- [ ] **T34** — Composant client : interrupteur général, une ligne par domaine (libellé,
      description, case — grisée si le général est coupé, valeur conservée), bouton Enregistrer
      (`Button`, `disabled` pendant l'envoi), message de confirmation, bandeau « Aucune adresse
      email sur votre compte » si `hasEmail` est faux.
      *(fichier : `src/app/(auth)/profile/notifications/NotificationPreferencesClient.tsx`)*
- [ ] **T35** — Déplacer les réglages détaillés de l'emploi (`JobSubscriptionClient`) de
      `/profile` vers la nouvelle page, sous le domaine « Emploi ».
      *(fichiers : `src/app/(auth)/profile/page.tsx`, `src/app/(auth)/profile/JobSubscriptionClient.tsx`)*
- [ ] **T36** — Lien « Mes notifications » dans la section Compte de `/profile`, vers
      `/profile/notifications`. *(fichier : `src/app/(auth)/profile/page.tsx`)*

### 1.6 Documentation

- [ ] **T37** — `docs/adr/0016-preferences-notifications-email.md` : règle « un domaine par
      notification, email décidé centralement par préférence utilisateur, jamais figé au niveau
      du code appelant » — statut Accepté, référence spec 053. Mettre à jour `docs/adr/README.md`.
- [ ] **T38** — `CLAUDE.md` : section notifications (domaines déclarés par les manifestes,
      `notifyUsers`/`dispatchUserEmails`, page `/profile/notifications`).
- [ ] **T39** — `docs/api.md` : documenter `GET`/`PUT /api/notifications/preferences`.

### 1.7 Tests

- [ ] **T40** [P] — `resolveEmailPreference` (global coupé, préférence explicite vraie/fausse,
      défaut du domaine) ; `getPreferencesView` (domaines visibles par permission, par historique,
      `hasEmail`, cas `jobs`) ; `updatePreferences` (upsert, écriture
      `JobNotificationSubscription.email`, rejet d'une clé non visible).
      *(fichier : `src/lib/__tests__/notification-preferences.test.ts`)*
- [ ] **T41** [P] — `dispatchUserEmails` (email envoyé/non envoyé selon préférence et présence
      d'une adresse, pied de page présent, erreur SMTP avalée et journalisée) ; `tx` optionnel
      respecté par `createNotification`/`notifyUsersWithRole`/`notifyDeptMembers`/`notifyUsers`.
      *(fichier : `src/lib/__tests__/notifications.test.ts`, nouveau)*
- [ ] **T42** [P] — `collectNotificationDomains`/`buildNotificationDomains` : clés uniques,
      conflit entre deux modules détecté, domaines des modules inactifs absents.
      *(fichiers : `src/core/__tests__/module-registry.test.ts`, `src/core/__tests__/notification-domains.test.ts`)*
- [ ] **T43** — `GET`/`PUT /api/notifications/preferences` : 401 sans session, domaines filtrés
      par visibilité, clé inconnue rejetée, écriture correcte, `jobs` écrit l'abonnement.
      *(fichier : `src/app/api/notifications/__tests__/preferences.test.ts`)*
- [ ] **T44** — Mettre à jour les tests existants des sites migrés en 1.4 (comptabilité, care,
      intégration, emploi, rappels de service) pour les nouvelles signatures (`domain`, `tx`
      optionnel) sans changer les assertions de contenu des emails/notifications.
- [ ] **T45** — Test-gardien : `sendEmail` (de `@/lib/email`) n'est importé, dans `src/`, que par
      `src/lib/notifications.ts` et la liste blanche des sites « sans compte » ou « adresse
      institutionnelle » identifiés en 1.4 (`care/services/appointments.ts`,
      `agenda/requests/[id]/schedule`, branche sans-compte de
      `care/services/notifications.ts`, `api/integration/requests`, digest planning vers
      `church.secretariatEmails`, `accounting/requests/route.ts` vers `church.accountingEmails`,
      les branches « membre sans compte » de T25/T26). Comptage statique des imports, sur le
      modèle de `scripts/check-prisma-boundary.sh`. *(fichier : `src/lib/__tests__/notifications-no-direct-email.test.ts`, nouveau)*

---

## Lot 2 — Cohérence : toutes les notifications passent par le mécanisme

Un domaine activé envoie désormais **toutes** ses notifications par email, y compris celles qui
n'étaient jusqu'ici que dans l'application.

### 2.1 Sites déjà sur les helpers — ajout du domaine

- [ ] **T46** [P] — `domain: "planning"` sur les deux appels `createNotification` (ouverture/fermeture).
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`)*
- [ ] **T47** [P] — `domain: "requests"`. *(fichier : `src/modules/planning/services/announcement-sheet.service.ts`)*
- [ ] **T48** [P] — `domain: "media"`. *(fichier : `src/app/api/media/files/[id]/route.ts`)*
- [ ] **T49** [P] — `domain: "requests"` sur les deux appels `notifyDeptMembers`.
      *(fichier : `src/app/api/requests/route.ts`)*
- [ ] **T50** [P] — `domain: "requests"`. *(fichier : `src/app/api/requests/[id]/route.ts`)*
- [ ] **T51** [P] — `domain: "account"`. *(fichier : `src/app/api/users/[userId]/roles/route.ts`)*
- [ ] **T52** — La notification in-app aux comptables sur une nouvelle demande (T24) passe
      désormais aussi par le filtre email du domaine `accounting` : un comptable qui active ce
      domaine reçoit un email personnel, en plus de l'adresse institutionnelle existante qui ne
      change pas. *(fichier : `src/app/api/accounting/requests/route.ts`)*

### 2.2 Sites en écriture Prisma directe — conversion vers les helpers

- [ ] **T53** [P] — Les 6 `tx.notification.create` convertis en `createNotification(tx, ...,
      { domain: "planning" })` (T21). *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [ ] **T54** [P] — Les 2 `tx.notification.create` convertis, `domain: "rooms"`.
      *(fichier : `src/modules/rooms/services/checklist.service.ts`)*
- [ ] **T55** [P] — Le `createMany` remplacé par des appels `notifyUsers`, `domain: "planning"` —
      conserver le fire-and-forget (`.catch(() => {})`) pour l'écriture in-app comme pour l'email.
      *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*
- [ ] **T56** [P] — Les 3 `notification.create(Many)` convertis, `domain: "account"`.
      *(fichiers : `src/app/api/member-link-requests/route.ts`, `src/app/api/member-link-requests/[id]/route.ts`)*
- [ ] **T57** [P] — Convertis, `domain: "jobs"` — même remarque qu'en T30 : les filtres
      `wantSeekers`/`wantFreelanceMissions`/`wantFreelanceProfiles` restent appliqués avant l'appel.
      *(fichiers : `src/app/api/jobs/seekers/route.ts`, `src/app/api/jobs/freelance/missions/route.ts`, `src/app/api/jobs/freelance/profiles/route.ts`)*

### 2.3 Cohérence et documentation

- [ ] **T58** — Étendre le test-gardien T45 : après ce lot, aucun `prisma.notification.create`/
      `createMany` ni `tx.notification.create`/`createMany` ne doit subsister hors de
      `src/lib/notifications.ts` (recherche statique).
- [ ] **T59** — Amender `specs/053-preferences-notifications-email/spec.md` : ajouter la ligne
      « Médias » au tableau des domaines (découverte T13), avec l'exemple « fichier accepté ou
      refusé ».

### 2.4 Tests

- [ ] **T60** — Étendre T44 aux sites du lot 2 : les tests existants (absence, checklist salles,
      planning, demandes, accès, emploi) vérifient le `domain` transmis.
- [ ] **T61** — Test de bout en bout minimal (Prisma et `sendEmail` mockés) : un domaine
      désactivé par défaut (ex. `rooms`) puis activé par l'utilisateur fait effectivement partir
      un email lors du déclenchement d'une notification de ce domaine.
      *(fichier : `src/lib/__tests__/notifications.test.ts`)*

---

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Migration rejouée sur base vierge, `prisma migrate diff --exit-code` sans écart
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (voir couverture ci-dessous)
- [ ] PR de chaque lot ouverte vers `feat/preferences-notifications-email`, puis PR finale de
      `feat/preferences-notifications-email` vers `main`

## Couverture des critères d'acceptation

| Critère (spec.md) | Couvert par |
|---|---|
| Page « Mes notifications », interrupteur général + réglage par domaine | T32-T36 |
| Désactiver un domaine arrête ses emails (pour cet utilisateur seul), les notifications in-app continuent | T16, T20, T22-T31, T46-T57, T40-T41 |
| Activer un domaine qui n'envoyait pas d'email fait partir des emails | T16, T20, T46-T57, T61 |
| Interrupteur général coupe tout ; réactivation restaure les réglages précédents | T16-T18, T40 |
| Mise en service : rien ne change ; domaine partiellement couvert activé en entier | T8-T15 (`defaultEmail`), T22-T31 |
| Chaque email indique le domaine et un lien vers Mes notifications | T19, T41 |
| Les emails aux personnes sans compte partent comme avant | T22-T31 (liste blanche), T45, T58 |
| Un utilisateur ne peut voir/modifier que ses propres préférences | T32, T43 |
| Utilisateur sans adresse email : message affiché | T17, T34 |
| La page n'affiche que les domaines pertinents | T17, T40, T43 |
| Multi-églises : un seul jeu de réglages par personne | T17 |
| Réglages emploi conservés et modifiables | T14, T18, T30-T31, T35 |
| Aucune action métier n'échoue parce qu'un email n'est pas envoyé | T20, T41 |

Les 13 critères d'acceptation de la spec sont couverts.
