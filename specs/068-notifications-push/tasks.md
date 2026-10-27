# Tâches — Notifications natives sur le téléphone et l'ordinateur

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0024-notifications-push-web-push.md`
- **Statut** : En cours

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche de travail à jour depuis `main`.
- [x] Ajout de `web-push` (MIT) et de `@types/web-push` (dev), lockfile régénéré par
  `npm install`. Vérifier ensuite `npm audit --omit=dev --audit-level=high`.
- [x] Paire de clés VAPID de développement générée (`npx web-push generate-vapid-keys`) et
  ajoutée à `.env.example`, **sans valeur réelle** : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`.

## Tâches

### 1. Données & migration

- [x] **T1** — Schéma :
  - modèles `PushSubscription` et `NotificationPushPreference` ;
  - champ `Notification.pushedAt` avec l'index `[pushedAt, createdAt]` ;
  - relations inverses sur `User`.

  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration `add_push_notifications` :
  - création des deux tables (clés étrangères `onDelete: Cascade`) ;
  - ajout de `pushed_at` et de l'index ;
  - `UPDATE notifications SET pushed_at = created_at` pour l'historique.

  Vérifier qu'elle ne fait que cela, puis régénérer le client. *(fichiers :
  `prisma/migrations/<horodatage>_add_push_notifications/migration.sql`, `src/generated/prisma/`)*

### 2. Logique métier (`src/lib/push/`)

- [x] **T3** [P] — `config.ts` : lecture de `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et
  `VAPID_SUBJECT`, `isPushConfigured()` et `getVapidPublicKey()`. Configuration de `web-push`
  faite une seule fois, au premier envoi. *(fichier : `src/lib/push/config.ts`)*
- [x] **T4** [P] — `payload.ts` : `buildPushPayload(notification)`, fonction pure.
  - Contenu : `{ title, body, url, tag }`.
  - Titre et message identiques à la notification, tronqués à 120 et 240 caractères.
  - `url` : le `link` relatif, ou `/accueil` à défaut ; un lien absolu ou externe est ramené à
    `/accueil`.
  - `tag` : l'`id` de la notification.

  *(fichier : `src/lib/push/payload.ts`)*
- [x] **T5** [P] — `preferences.ts` :
  - `resolvePushPreference({ globalEnabled, domainPreference })`, pure : défaut activé ;
  - `PUSH_GLOBAL_DOMAIN = "*"` ;
  - lecture des préférences de plusieurs utilisateurs pour un domaine ;
  - écriture en upsert, sur le modèle de `updatePreferences`.

  *(fichier : `src/lib/push/preferences.ts`)*
- [x] **T6** [P] — `subscriptions.ts` :
  - `subscribeDevice(userId, { endpoint, keys }, userAgent)` : upsert par `endpointHash`
    (SHA-256), réattribution journalisée si l'endpoint appartient à un autre compte ;
  - `unsubscribeDevice(userId, { endpoint } | { id })` : supprime uniquement si l'abonnement
    appartient à l'appelant ;
  - `countDevices(userId)` ;
  - `deviceLabel(userAgent)`, pure (« iPhone · Safari », « Android · Chrome »,
    « Windows · Edge »…).

  *(fichier : `src/lib/push/subscriptions.ts`)*
- [x] **T7** — `deliver.ts` : `deliverPendingPush(filter)`.
  1. Sélectionne les notifications `pushedAt = null` du filtre, avec soit
     `{ userIds, type, createdAfter }`, soit `{ since }`.
  2. Prend chacune par
     `updateMany({ where: { id, pushedAt: null }, data: { pushedAt: now } })` et ne garde que
     celles où `count === 1`.
  3. Filtre par `resolvePushPreference` du domaine.
  4. Envoie à chaque abonnement du destinataire : TTL 24 h, délai de 5 s, concurrence bornée
     à 10.
  - Une réponse `404`/`410` supprime l'abonnement ; un succès met à jour `lastSuccessAt`.
  - Toute erreur est journalisée et avalée.
  - Sans configuration VAPID, rien n'est envoyé et aucune ligne n'est prise.

  *(fichier : `src/lib/push/deliver.ts`)*
- [x] **T8** — Branchement dans `dispatchIfNoTx` : après l'email, appeler
  `deliverPendingPush({ userIds, type, createdAfter: <instant de début de l'appel> })`.
  - L'instant de début est capturé dans `createNotification`, `notifyUsers`,
    `notifyUsersWithRole` et `notifyDeptMembers` avant l'écriture.
  - `email: false` ne coupe pas le push ; `tx` le coupe.
  - Mettre à jour le commentaire d'en-tête du fichier (canaux, ADR-0024).

  *(fichier : `src/lib/notifications.ts`)*
- [x] **T9** — Vue et écriture des préférences, étendues aux deux canaux :
  - `getPreferencesView` ajoute `pushEnabled`, `push` par domaine, `pushAvailable`,
    `vapidPublicKey` et `deviceCount` ;
  - `updatePreferences` accepte `pushEnabled` et `pushDomains`.

  *(fichier : `src/lib/notification-preferences.ts`)*
- [x] **T10** — Tâche cron `push-delivery` en `every-run`, qui appelle
  `deliverPendingPush({ since: now - 1 h })`, ajoutée à `cronTasks`. *(fichier :
  `src/app/api/cron/route.ts`)*
- [x] **T11** — Déconnexion :
  - la server action `signOut` lit le cookie `koinonia-push-device` ;
  - elle appelle `unsubscribeDevice(session.user.id, { id })`, puis efface le cookie, puis
    appelle `signOut`.

  *(fichier : `src/app/(auth)/layout.tsx`, et `src/app/no-access/page.tsx` pour la seconde
  action de déconnexion)*

### 3. API

- [x] **T12** — Contrat de `push/subscriptions` (ADR-0023) :
  - `POST` : `subscribeSchema`, avec `endpoint` en URL https de 2048 caractères au plus et
    `keys.p256dh`/`keys.auth` en base64url de 255 caractères au plus ;
  - `DELETE` : `{ endpoint? }` ;
  - accès `session` ; règles de réattribution et de `204` neutre.

  *(fichier : `src/app/api/notifications/push/subscriptions/contract.ts`)*
- [x] **T13** — Route handler :
  - `POST` : Zod, puis `requireAuth`, puis `503` si non configuré, puis `subscribeDevice`.
    Cookie `koinonia-push-device` posé en `httpOnly`, `Secure` (sauf en dev), `SameSite=Lax`,
    `Path=/`, pour un an.
  - `DELETE` : endpoint du corps, sinon cookie, puis `unsubscribeDevice`, puis `204` et cookie
    effacé.

  *(fichier : `src/app/api/notifications/push/subscriptions/route.ts`)*
- [x] **T14** — Contrat et route des préférences :
  - `putSchema` accepte `pushEnabled` et `pushDomains` ;
  - un domaine push non visible est refusé en `400`, comme pour l'email ;
  - description du contrat mise à jour.

  *(fichiers : `src/app/api/notifications/preferences/contract.ts`, `route.ts`)*
- [x] **T15** — `npm run openapi` et commit de `docs/openapi.json`. Vérifier que
  `route-exhaustiveness.test.ts` passe (préfixe `/api/notifications` déjà déclaré) et que le
  seuil de `lint:prisma-boundary` est inchangé.

### 4. UI & PWA

- [x] **T16** [P] — Service worker :
  - `push` : `showNotification(title, { body, icon, badge, tag, data: { url } })` ;
  - `notificationclick` : met au premier plan un client sur l'origine et y navigue, sinon
    `openWindow`. L'URL est forcée sur l'origine.
  - `CACHE_NAME` passe à `koinonia-v4`.

  *(fichier : `public/sw.js`)*
- [x] **T17** [P] — Icônes PNG générées depuis `koinonia-app-icon.svg` par un script `sharp` :
  192, 512, maskable 512, `apple-touch-icon` 180 et badge monochrome 96. Le manifeste et
  l'`apple-touch-icon` du layout racine sont mis à jour. *(fichiers :
  `scripts/generate-app-icons.mjs`, `public/brand/*.png`, `public/manifest.json`,
  `src/app/layout.tsx`)*
- [x] **T18** [P] — Détection de l'état de l'appareil, en fonction pure testable :
  `pushDeviceState({ hasServiceWorker, hasPushManager, isIos, isStandalone, permission,
  subscribed, configured })`, qui renvoie `unavailable-ios-install`, `unavailable-browser`,
  `blocked`, `enabled` ou `disabled`. *(fichier :
  `src/app/(auth)/profile/notifications/push-device-state.ts`)*
- [x] **T19** — Composant client `PushDeviceCard` : bloc « Notifications sur cet appareil ».
  - `StatusChip` pour l'état et compteur d'appareils.
  - « Activer » : `Notification.requestPermission()` dans le gestionnaire du clic, puis
    `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, puis POST.
  - « Désactiver sur cet appareil » : `unsubscribe`, puis DELETE.
  - `Alert` pour les états « bloquées » (comment rétablir) et « indisponibles » (guide
    « Ajouter à l'écran d'accueil » sur iPhone et iPad, ou navigateur non compatible).
  - `useToast` pour les retours.

  *(fichier : `src/app/(auth)/profile/notifications/PushDeviceCard.tsx`)*
- [x] **T20** — Page « Mes notifications » :
  - `PushDeviceCard` en tête, puis l'interrupteur général « Recevoir les notifications sur mes
    appareils » à côté de celui de l'email ;
  - deux `Checkbox` par domaine (**Email**, **Sur l'appareil**), en tableau sur grand écran et
    en carte à deux lignes sur mobile ;
  - un enregistrement unique pour les deux canaux.

  *(fichiers : `NotificationPreferencesClient.tsx`, `page.tsx` du même dossier)*
- [x] **T21** — Relire les titres et messages existants du domaine `care` et des autres domaines
  sensibles : aucun ne doit contenir de détail d'entretien pastoral ni de coordonnée bancaire.
  Corriger le texte si besoin, et le consigner dans la PR. *(fichiers :
  `src/modules/care/services/*`, `src/modules/accounting/**`, `src/modules/giving/**`)*

### 5. Tests

- [x] **T22** [P] — `payload.test.ts` :
  - titre et message identiques à la notification, troncature ;
  - `url` par défaut et lien externe ramené à `/accueil`, `tag` égal à l'`id` ;
  - aucun champ supplémentaire.

  *(fichier : `src/lib/push/__tests__/payload.test.ts`)*
- [x] **T23** [P] — `preferences.test.ts` : `resolvePushPreference` (général désactivé,
  préférence explicite, défaut activé) et écriture en upsert. *(fichier :
  `src/lib/push/__tests__/preferences.test.ts`)*
- [x] **T24** [P] — `subscriptions.test.ts` :
  - création et réattribution journalisée ;
  - `unsubscribeDevice` limité au propriétaire ;
  - `deviceLabel` sur plusieurs User-Agent.

  *(fichier : `src/lib/push/__tests__/subscriptions.test.ts`)*
- [x] **T25** — `deliver.test.ts`, avec `web-push` mocké :
  - prise atomique (`count === 0` n'envoie rien) et pas de doublon entre l'appel immédiat et le
    rattrapage ;
  - préférence désactivée : `pushedAt` posé sans envoi ;
  - plusieurs appareils : envoi à chacun ;
  - `410`/`404` : abonnement supprimé ; autre erreur : avalée ; `lastSuccessAt` mis à jour ;
  - rattrapage : notifications de plus d'une heure ignorées ;
  - sans VAPID : aucune prise ni aucun envoi.

  *(fichier : `src/lib/push/__tests__/deliver.test.ts`)*
- [x] **T26** — `notifications.test.ts`, existant et étendu :
  - sans `tx`, la livraison push est appelée ; avec `tx`, elle ne l'est pas ;
  - `email: false` n'empêche pas le push.

  *(fichier : `src/lib/__tests__/notifications.test.ts`)*
- [x] **T27** — Routes :
  - `push/subscriptions` :
    - `401` sans session ;
    - `400` sur un endpoint non https ou des clés vides ;
    - `503` sans VAPID ;
    - POST : cookie posé ;
    - DELETE : neutre (`204`) pour un abonnement d'autrui.
  - Préférences : `400` sur un domaine push non visible, écriture des deux canaux.

  *(fichiers : `src/app/api/notifications/push/subscriptions/__tests__/route.test.ts`,
  `src/app/api/notifications/preferences/__tests__/*`)*
- [x] **T28** [P] — `push-device-state.test.ts` : les cinq états, en particulier un iPhone non
  installé (« indisponible, installer ») et la permission refusée (« bloquées »). *(fichier :
  `src/app/(auth)/profile/notifications/__tests__/push-device-state.test.ts`)*
- [x] **T29** — Déconnexion : la server action supprime l'abonnement du cookie seulement s'il
  appartient à la session, puis efface le cookie. *(fichier : test de la server action, à
  extraire au besoin dans une fonction testable de `src/lib/push/subscriptions.ts`)*
- [x] **T30** — Cron : la tâche `push-delivery` est déclarée en `every-run` et appelle le
  rattrapage. *(fichier : `src/app/api/cron/__tests__/*`)*

### 6. Documentation & livraison

- [x] **T31** [P] — `CLAUDE.md` : section « Notifications et préférences » complétée par le
  canal push (source = la cloche, livraison immédiate + rattrapage, préférences push, défaut
  activé). Y ajouter aussi le passage de l'ADR-0024 au statut « Accepté ». *(fichiers :
  `CLAUDE.md`, `docs/adr/0024-notifications-push-web-push.md`)*
- [x] **T32** [P] — Exploitation : génération et stockage des clés VAPID par environnement,
  conséquence d'une rotation, variables d'environnement. *(fichiers : `docs/production.md`,
  `docs/dev-onboarding.md`, `docs/staging.md`)*
- [x] **T33** [P] — Base de données : tables `push_subscriptions` et
  `notification_push_preferences`, et colonne `notifications.pushed_at`. *(fichier :
  `docs/database.md`)*
- [x] **T34** [P] — Guide utilisateur : entrée « Notifications sur le téléphone » pour tous les
  rôles (installer sur iPhone et Android, activer, choisir par domaine). *(fichier :
  `src/components/GuideContent.tsx`)*
- [x] **T35** — CHANGELOG, section « Non publié », entrée « Ajouté ». *(fichier : `CHANGELOG.md`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary`, seuil inchangé
- [x] `npm run test`
- [x] `npm run build`
- [ ] Migration rejouée sur base vierge (job CI `migrations`)
- [ ] Clés VAPID configurées sur staging
- [ ] Recette staging :
  - Android Chrome installé et non installé ;
  - iPhone installé (iOS 16.4 ou plus récent) et iPhone non installé (guide affiché) ;
  - ordinateur Chrome et Edge ;
  - appui sur une notification, application ouverte puis fermée ;
  - notification créée en transaction (absence déclarée), reçue en 5 minutes au plus ;
  - déconnexion, puis reconnexion avec un autre compte ;
  - autorisation retirée dans les réglages.
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (correspondance ci-dessous)
- [ ] PR ouverte vers `main`

## Correspondance critères d'acceptation → tâches

| Critère (spec) | Tâches |
|---|---|
| Quatre états affichés selon l'appareil | T18, T19, T28 |
| Autorisation demandée seulement après « Activer » | T19 |
| iPhone/iPad non installé : « indisponibles » et guide | T18, T19, T28 |
| Choix « Sur l'appareil » par domaine, indépendant de l'email | T5, T9, T14, T20, T27 |
| Domaine activé : notification native sur chaque appareil activé | T7, T8, T10, T16, T25, T26 |
| Domaine désactivé : rien sur les appareils, la cloche reste | T5, T7, T25 |
| Interrupteur général qui coupe tout en gardant les choix | T5, T9, T20, T23 |
| Réglages email inchangés à la mise en service | T2, T9, T27 |
| Un appui ouvre l'écran de la cloche | T4, T16, T22 |
| Texte limité à celui de la cloche | T4, T21, T22 |
| Après déconnexion, l'appareil ne reçoit plus le compte | T11, T29 |
| Désactiver un appareil n'arrête pas les autres | T6, T19, T24 |
| Appareil qui ne répond plus oublié, sans échec de l'action | T7, T25 |
| Envoi seulement pour un domaine visible | T7 (destinataires de la notification), T14 |
| Icône nette sur Android et iPhone | T17 |
