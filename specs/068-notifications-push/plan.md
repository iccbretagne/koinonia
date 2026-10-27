# Plan technique — Notifications natives sur le téléphone et l'ordinateur

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-10-27
- **ADR** : [ADR-0024 — Notifications natives par Web Push, livrées depuis les notifications de l'application](../../docs/adr/0024-notifications-push-web-push.md) (à créer avec ce plan)

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : rien dans un module. Le canal push vit dans `src/lib/` à côté de
  `notifications.ts` et `notification-preferences.ts`, comme l'email (spec 053). Les modules
  continuent d'appeler `createNotification`/`notifyUsers`… sans rien changer.
- [x] **Sécurité** : les nouvelles routes portent sur **les réglages et appareils de l'appelant
  lui-même**, sans église cible. Elles sont protégées par `requireAuth()`, comme
  `/api/notifications/preferences` aujourd'hui. Aucune permission d'église n'est évaluée, donc
  aucune n'est évaluée sans `churchId`.
- [x] **Permissions** : aucune nouvelle. La visibilité des domaines reste celle de la spec 053
  (`rolePermissions` via `getVisibleDomains`).
- [x] **Validation** Zod sur toutes les mutations (abonnement, désabonnement, préférences).
- [x] **Migration** Prisma : `add_push_notifications` (deux tables, une colonne).
- [x] **Enums** : aucun nouvel enum.
- [x] **UI** : `Button`, `Alert`, `Checkbox`, `StatusChip` et `useToast` de `src/components/ui/`.

## Approche générale

1. **Web Push standard** (VAPID, RFC 8030/8291/8292), sans service tiers : Koinonia signe et
   chiffre les messages avec sa propre paire de clés et les remet aux services push des
   navigateurs (Apple, Google, Mozilla). La librairie `web-push` (MIT) fait le chiffrement.
2. **La cloche est la source** : on n'envoie une notification native que pour une
   **notification de l'application qui existe déjà en base**. Chaque ligne `Notification` porte
   l'état de sa livraison push. Toute notification créée par les helpers existants est donc
   candidate, sans modifier les 34 sites d'appel. Une notification émise sans ligne (email seul,
   comme la confirmation de demande de RDV) ne part pas en push : c'est conforme au critère
   « rien de plus que la cloche ».
3. **Deux moments de livraison** :
   - **immédiat** : dans `dispatchIfNoTx` (`src/lib/notifications.ts`), juste après l'email,
     pour les notifications créées hors transaction, c'est-à-dire presque toutes ;
   - **rattrapage** : une tâche cron `every-run` (5 min, ADR-0021) livre les notifications
     créées **dans une transaction** (absences, signalements de salle), que l'on ne peut pas
     pousser avant la validation, ainsi que celles dont l'envoi immédiat a été interrompu.
   - Les deux passent par la même **prise de main atomique** par notification : aucun doublon.
4. **Préférences** : nouvelle table de préférences push, calquée sur celle de l'email, avec la
   même clé `*` pour l'interrupteur général et une ligne par domaine. Domaine sans ligne =
   **activé**, conformément à la décision de la spec.
5. **Appareils** : une ligne par abonnement de navigateur. Un appareil n'appartient qu'à **un**
   compte : se réabonner depuis un autre compte le réattribue. Un cookie `httpOnly` désigne
   l'abonnement de l'appareil courant, pour le supprimer **côté serveur** à la déconnexion.
6. **Service worker** existant (`public/sw.js`) : ajout des gestionnaires `push` et
   `notificationclick`. Icônes PNG ajoutées au manifeste pour l'installation iOS et les
   notifications.

## Modèle de données

```prisma
/// Abonnement Web Push d'un appareil (navigateur installé ou non) — spec 068.
model PushSubscription {
  id            String    @id @default(cuid())
  userId        String
  /// Adresse du service push (fournie par le navigateur). Unique : un appareil, un compte.
  endpoint      String    @db.Text
  /// Empreinte SHA-256 de `endpoint`, pour l'unicité (un TEXT ne s'indexe pas en entier).
  endpointHash  String    @unique @db.Char(64)
  p256dh        String    @db.VarChar(255)
  auth          String    @db.VarChar(255)
  /// Libellé lisible (« iPhone · Safari ») dérivé de l'User-Agent, pour « Mes notifications ».
  label         String?   @db.VarChar(120)
  createdAt     DateTime  @default(now())
  lastSuccessAt DateTime?
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("push_subscriptions")
}

/// Préférence push par domaine — même forme que `NotificationEmailPreference` (spec 053).
/// `domain = "*"` : interrupteur général « Recevoir les notifications sur mes appareils ».
model NotificationPushPreference {
  userId    String
  domain    String
  enabled   Boolean
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, domain])
  @@map("notification_push_preferences")
}

model Notification {
  // … champs existants
  /// Livraison push (spec 068) : renseigné quand un passage a pris la notification en charge,
  /// envoyée ou écartée (préférence, aucun appareil). Null = encore à traiter.
  pushedAt  DateTime?

  @@index([pushedAt, createdAt])
}
```

- **Migration** `add_push_notifications` : création des deux tables, puis ajout de `pushedAt`
  et de l'index.
- `UPDATE notifications SET pushed_at = created_at` à la migration : l'historique existant
  n'est jamais poussé à la mise en service.
- Relations inverses `pushSubscriptions` et `notificationPushPreferences` sur `User`.
- `Notification` reste sans `churchId`, comme aujourd'hui. La notification native porte le même
  lien que la cloche, voir **Risques**.

## API

Toutes sur le préfixe `/api/notifications`, déjà déclaré dans le manifeste `core`, donc sans
nouvelle entrée de route. Chacune a son `contract.ts` (ADR-0023), et `npm run openapi` est
relancé.

| Endpoint | Méthode | Accès | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/notifications/push/subscriptions` | POST | `requireAuth` | `{ endpoint: https url ≤ 2048, keys: { p256dh, auth } (base64url ≤ 255) }` | `{ id }` + cookie `koinonia-push-device` |
| `/api/notifications/push/subscriptions` | DELETE | `requireAuth` | `{ endpoint? }` (sinon le cookie) | `204` |
| `/api/notifications/preferences` | GET | `requireAuth` (inchangé) | — | vue enrichie : `pushEnabled`, `push` par domaine, `pushAvailable`, `vapidPublicKey`, `deviceCount` |
| `/api/notifications/preferences` | PUT | `requireAuth` (inchangé) | `+ pushEnabled?: boolean, pushDomains?: Record<string, boolean>` | vue enrichie |

**Règles**
- **POST** : upsert par `endpointHash`. Un endpoint existant d'un **autre** compte est
  **réattribué** à l'appelant, ses clés sont remplacées, et l'opération est journalisée. Le
  cookie `httpOnly; Secure; SameSite=Lax` contient l'`id` de l'abonnement.
- **DELETE** : ne supprime qu'un abonnement **de l'appelant**. Un endpoint inconnu ou d'un
  autre compte donne `204` sans effet, pour ne pas servir d'oracle sur l'existence d'un
  endpoint.
- **PUT** : comme pour l'email, une clé de `pushDomains` hors des domaines visibles est refusée
  en `400`.
- Si les clés VAPID sont absentes de l'environnement, `pushAvailable: false` : POST répond
  `503` et l'interface affiche l'état « indisponibles ».
- La clé publique VAPID est servie par l'API et passée en prop par la page serveur, **jamais**
  en `NEXT_PUBLIC_*`. L'artefact de production est construit une seule fois (sur le tag) et
  promu tel quel, donc une variable figée au build serait fausse d'un environnement à l'autre.

## Services / logique métier

Nouveau dossier `src/lib/push/` :

- **`config.ts`** : lecture de `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` ;
  `isPushConfigured()`.
- **`preferences.ts`** :
  - `resolvePushPreference({ globalEnabled, domainPreference })`, pure : général désactivé →
    faux, sinon préférence du domaine, sinon **vrai** ;
  - lecture et écriture des préférences push.
  - `getPreferencesView` et `updatePreferences` (`notification-preferences.ts`) sont étendues
    pour lire et écrire les deux canaux en une vue.
- **`subscriptions.ts`** :
  - `subscribeDevice(userId, input, userAgent)` (upsert et réattribution) ;
  - `unsubscribeDevice(userId, endpoint | id)` ;
  - `deviceLabel(userAgent)`, pure.
- **`payload.ts`** : `buildPushPayload(notification)`, pure.
  - Contient `{ title, body, url, tag }`, titre et message **identiques** à la ligne
    `Notification`, tronqués à 120 et 240 caractères.
  - `url` reprend le `link` relatif, ou `/accueil` à défaut ; `tag` reprend l'`id` de la
    notification.
- **`deliver.ts`** :
  - `deliverPendingPush({ notificationIds?, since })` :
    1. sélectionne les notifications `pushedAt = null` du filtre ;
    2. prend chacune par `updateMany({ id, pushedAt: null } → pushedAt: now)`, et ne garde que
       celles où `count === 1` ;
    3. filtre par préférence push du domaine ;
    4. envoie à chaque abonnement du destinataire (TTL 24 h, concurrence bornée à 10).
  - Une réponse `404`/`410` du service push supprime l'abonnement ; un succès met à jour
    `lastSuccessAt`.
  - Toute erreur est journalisée et **avalée**, comme `dispatchUserEmails` : jamais d'échec
    remonté à l'action métier.
  - `notifyUsers` crée ses lignes par `createMany`, qui ne renvoie pas les `id`. L'appel
    immédiat filtre donc par
    `{ userId ∈ destinataires, type, createdAt ≥ instant de début de l'appel, pushedAt: null }` :
    - si deux appels se chevauchent, chaque ligne n'est prise qu'une fois, grâce à la prise
      atomique ;
    - une ligne prise par un autre appel est livrée par celui-ci.
- **Branchement** dans `src/lib/notifications.ts` :
  - `dispatchIfNoTx` appelle `deliverPendingPush` après l'email. `email: false` ne coupe **pas**
    le push : il ne concerne que l'email, et la ligne de cloche existe.
  - Pour Emploi, la ligne n'est créée que si `sub.inApp` : le cumul décidé dans la spec en
    découle sans code.
  - Avec `tx`, rien n'est envoyé : la tâche de rattrapage s'en charge.
- **Tâche cron** `push-delivery` (`every-run`) dans `/api/cron`, qui appelle
  `deliverPendingPush({ since: now - 1 h })`. Une notification de plus d'une heure n'est jamais
  poussée en retard.
- **Déconnexion** : la server action `signOut` du layout (`(auth)/layout.tsx`) lit le cookie
  `koinonia-push-device`, supprime l'abonnement correspondant **s'il appartient à la session**,
  efface le cookie, puis déconnecte. Côté client, le service worker n'est pas désabonné :
  l'appareil réabonné par le compte suivant sera réattribué (POST).
- **Visibilité des domaines** : une notification n'est créée que pour un destinataire concerné,
  et en recevoir une rend le domaine visible (règle historique de la spec 053). Le critère
  « seulement un domaine visible » est donc tenu sans contrôle supplémentaire à l'envoi.

## UI / composants

- **`public/sw.js`** :
  - `push` : `showNotification(title, { body, icon, badge, tag, data: { url } })` ;
  - `notificationclick` : met au premier plan un onglet Koinonia ouvert et y navigue
    (`client.navigate`), sinon `clients.openWindow(url)`. L'URL est forcée sur l'origine
    Koinonia, jamais externe ;
  - `CACHE_NAME` passe à `koinonia-v4`.
- **Icônes** : `public/brand/koinonia-icon-192.png`, `-512.png`, `-maskable-512.png`,
  `apple-touch-icon-180.png` et `badge-96.png` (monochrome), générés une fois depuis le SVG
  existant avec `sharp`, script dans `scripts/`. Le manifeste et l'`apple-touch-icon` du layout
  sont mis à jour.
- **`/profile/notifications`** (`NotificationPreferencesClient.tsx`) :
  - **Bloc « Notifications sur cet appareil »**, nouveau composant client `PushDeviceCard` :
    - détection : `'serviceWorker' in navigator && 'PushManager' in window`, iOS et iPadOS sans
      mode `standalone`, `Notification.permission` ;
    - quatre états, avec `StatusChip` :
      - **non activées** : bouton « Activer », qui appelle `Notification.requestPermission()`
        dans le gestionnaire du clic, puis `pushManager.subscribe`, puis POST ;
      - **activées** : bouton « Désactiver sur cet appareil », qui fait `unsubscribe` puis
        DELETE ;
      - **bloquées** : `Alert` expliquant comment rétablir l'autorisation ;
      - **indisponibles** : `Alert` avec le guide « Ajouter à l'écran d'accueil » sur iPhone et
        iPad, ou « navigateur non compatible ».
    - Affiche aussi « N appareils reçoivent tes notifications ».
  - **Tableau des domaines** : deux `Checkbox` par ligne (**Email**, **Sur l'appareil**) et
    deux interrupteurs généraux. Sur mobile, chaque domaine est une carte avec deux lignes.
    L'enregistrement reste unique, comme aujourd'hui.
- **Guide utilisateur** (`GuideContent.tsx`) : entrée « Notifications sur le téléphone »,
  installation sur iPhone et Android, puis activation.

## Décisions & alternatives écartées

- **Choix** : Web Push VAPID et `web-push`.
  - *Pourquoi* : c'est le standard implémenté par Safari (iOS 16.4+ installé), Chrome, Edge et
    Firefox. Pas de compte tiers ni de donnée confiée à un intermédiaire, et une seule
    dépendance (MIT).
  - **Écarté : Firebase Cloud Messaging, OneSignal**. *Raison* : un compte et un SDK tiers, des
    données de destinataires chez un tiers, un intérêt nul pour une PWA (FCM est de toute façon
    utilisé par Chrome en sous-main).
- **Choix** : livraison **depuis les lignes `Notification`** (`pushedAt`), avec une prise
  atomique.
  - *Pourquoi* : aucune modification des 34 sites d'appel. Les notifications créées en
    transaction sont livrées après validation sans mécanisme d'« après commit ». Le push ne
    contient par construction rien de plus que la cloche.
  - **Écarté : un hook « après commit »** sur `{ tx }`. *Raison* : Prisma n'en a pas ; il
    faudrait toucher chaque site transactionnel et le risque d'oubli resterait.
  - **Écarté : une file de tâches dédiée (table de jobs, Redis)**. *Raison* : `cron_task_runs`
    et `every-run` suffisent (ADR-0021) ; pas d'infrastructure de plus.
- **Choix** : une **table de préférences distincte** de l'email.
  - *Pourquoi* : changer la clé primaire de `notification_email_preferences` pour y ajouter un
    canal toucherait la spec 053 et sa migration. Deux tables identiques restent lisibles.
  - **Écarté : une colonne `channel`** dans la table existante. *Raison* : migration de clé
    primaire sur une table en production, pour un gain nul.
- **Choix** : défaut **activé** pour un domaine sans préférence push (décision de la spec).
  Sans appareil activé, ce défaut n'a aucun effet.
- **Choix** : cookie `httpOnly` désignant l'abonnement courant, nettoyé dans la server action de
  déconnexion.
  - *Pourquoi* : fonctionne même si le JavaScript de la page a échoué. Un appareil partagé ne
    garde jamais les notifications du compte précédent.
  - **Écarté : désabonnement côté client avant `signOut`**. *Raison* : fragile (onglet fermé,
    erreur réseau), et la déconnexion passe par un formulaire de server action.
- **Choix** : clé publique VAPID servie à l'exécution, sans `NEXT_PUBLIC_*` (voir API).
- **Choix** : TTL de 24 h et aucune nouvelle tentative applicative.
  - *Pourquoi* : le service push garde lui-même le message jusqu'à 24 h. Au-delà,
    l'information est périmée et reste dans la cloche ; l'email garde son rôle de secours.

## Risques & points d'attention

- **iOS** : push seulement si Koinonia est installée sur l'écran d'accueil, iOS 16.4 ou plus
  récent, après un geste de l'utilisateur.
  - L'état « indisponibles » et le guide couvrent le cas.
  - À vérifier sur un vrai iPhone en recette : sans SDK, aucun test automatique ne le couvre.
- **Lien et église courante** : `Notification` n'a pas d'église ; le lien est celui de la cloche,
  ouvert dans l'église courante — comportement validé (spec, « comme la cloche »).
- **Charge** : `notifyUsersWithRole` sur une grande église pousse vers des dizaines
  d'appareils. La concurrence bornée et l'appel `await` dans `dispatchIfNoTx` ajoutent la
  latence de l'envoi à l'action.
  - Mitigation : délai réseau borné à 5 s par envoi.
  - Si la mesure le justifie, déléguer entièrement au rattrapage, avec 5 minutes de délai au
    pire.
- **Clés VAPID** : à générer une fois par environnement (production, staging), stockées comme
  secrets.
  - En changer invalide tous les abonnements, qui sont alors supprimés au premier `410`.
  - Documenté dans `docs/production.md`.
- **Confidentialité** : le contenu est chiffré de bout en bout jusqu'au navigateur (RFC 8291),
  mais les métadonnées (horaire, appareil) passent par Apple, Google ou Mozilla. Le contenu se
  limite au titre et au message de la cloche. Une **vérification des messages existants** du
  domaine `care` est prévue en tâche, pour qu'aucun ne contienne de détail d'entretien.
- **CSP** : rien à modifier. L'envoi part du serveur, et `worker-src 'self'` couvre déjà le
  service worker.
- **Service worker en cache** : `CACHE_NAME` est incrémenté, et `skipWaiting` + `clients.claim`
  sont déjà en place. Les anciens onglets récupèrent le nouveau worker au chargement suivant.
- **Garde `prisma-boundary`** : les routes passent par `src/lib/push/` ; seuil inchangé.

## Stratégie de tests

Vitest, Prisma mocké via `@/__mocks__/prisma`, `web-push` mocké.

- **`preferences.test.ts`** :
  - `resolvePushPreference` : général désactivé, préférence explicite, défaut activé ;
  - vue enrichie et écriture des deux canaux, avec refus d'un domaine non visible (route).
- **`payload.test.ts`** : titre et message identiques à la notification, troncature, `url` par
  défaut `/accueil`, `tag` égal à l'`id`, aucun champ supplémentaire.
- **`deliver.test.ts`** :
  - prise atomique : un `count === 0` n'envoie rien, pas de doublon entre l'appel immédiat et le
    rattrapage ;
  - préférence désactivée : `pushedAt` posé sans envoi ;
  - plusieurs appareils : envoi à chacun ;
  - réponse `410` ou `404` : abonnement supprimé ; autre erreur : journalisée et avalée,
    `lastSuccessAt` mis à jour en cas de succès ;
  - rattrapage : ignore les notifications de plus d'une heure.
- **`notifications.test.ts`** (existant, étendu) :
  - sans `tx`, `deliverPendingPush` est appelé ; avec `tx`, il ne l'est pas ;
  - `email: false` n'empêche pas le push.
- **Routes `push/subscriptions`** :
  - `401` sans session, `400` sur une entrée invalide (endpoint non https, clés vides), `503`
    sans configuration VAPID ;
  - réattribution d'un endpoint d'un autre compte, cookie posé ;
  - DELETE limité aux abonnements de l'appelant, avec `204` neutre.
- **Déconnexion** : la server action supprime l'abonnement du cookie seulement s'il appartient
  à la session.
- **Cron** : la tâche `push-delivery` est déclarée en `every-run` et appelle le rattrapage.
- **`deviceLabel`** : quelques User-Agent (iPhone Safari, Android Chrome, Windows Edge).
- **Contrats** : `openapi.test.ts` après `npm run openapi`.
- **Hors Vitest** (recette staging) :
  - Android Chrome installé et non installé ;
  - iPhone installé, iOS 16.4 ou plus récent ;
  - ordinateur Chrome et Edge ;
  - appui sur une notification, application ouverte puis fermée ;
  - déconnexion, puis reconnexion avec un autre compte ;
  - autorisation retirée dans les réglages.
