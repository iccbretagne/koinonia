# Tâches — Installer Koinonia sur son appareil

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Pas de migration ni d'API : l'ordre suit
> logique cliente → page → points d'entrée → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche de travail contenant la spec 069 (icône versionnée, `getAppIconVersion`), donc la
  PR #703 fusionnée ou cette même branche.

## Tâches

### 1. Logique cliente (`src/lib/install/`)

- [ ] **T1** [P] — Détection pure :
  - `detectPlatform(userAgent, maxTouchPoints)` : `ios` (iPad présenté comme un Mac compris),
    `android` ou `desktop` ;
  - `detectBrowser(userAgent)` : `safari`, `chrome`, `edge`, `samsung`, `firefox`, `in-app`
    (WhatsApp, Facebook, Instagram, Messenger, WebView Android `; wv)`), `ios-other`
    (CriOS, FxiOS, EdgiOS) ou `other` ;
  - `installTarget({ platform, browser, standalone, canPrompt })` : `installed`, `ios-safari`,
    `ios-open-in-safari`, `android-prompt`, `android-manual`, `android-open-in-chrome`,
    `desktop-prompt`, `desktop-manual` ou `unsupported` ;
  - `isInstallOffered(target)` ;
  - `installHint(target)` : sous-titre de la ligne du menu du compte (« Sur l'écran d'accueil
    de votre iPhone », « En un appui sur ce téléphone », « Sur cet ordinateur »).

  *(fichier : `src/lib/install/detect.ts`)*
- [ ] **T2** — Déplacer `detectIos` dans `detect.ts`. `push-device-state.ts` le réexporte,
  sans changer de comportement. *(fichiers : `src/lib/install/detect.ts`,
  `src/app/(auth)/profile/notifications/push-device-state.ts`)*
- [ ] **T3** [P] — Magasin `beforeinstallprompt` :
  - `armInstallPrompt()`, idempotent : capture de l'événement avec `preventDefault`, et écoute
    de `appinstalled` ;
  - `subscribe` et `getSnapshot` pour `useSyncExternalStore`, qui donnent
    `{ canPrompt, installed }` ;
  - `promptInstall()`, qui renvoie `accepted`, `dismissed` ou `unavailable` ;
  - hook `useInstallTarget()`, qui calcule la cible au montage et vaut `null` avant.

  *(fichiers : `src/lib/install/prompt-store.ts`, `src/lib/install/use-install-target.ts`)*
- [ ] **T4** [P] — « Plus tard » : `isInstallCardDismissed(now)` et `dismissInstallCard(now)`.
  - Clé `koinonia-install-dismissed-until`, pour 30 jours.
  - `try/catch` autour du stockage.

  *(fichier : `src/lib/install/dismiss.ts`)*
- [ ] **T5** — Armer le magasin depuis `ServiceWorkerRegistration`, qui est monté dans le root
  layout. *(fichier : `src/components/ServiceWorkerRegistration.tsx`)*
- [ ] **T6** [P] — Déplacer `qrPath` dans `src/lib/qr.ts`. La slide de dons l'importe depuis ce
  nouvel emplacement. *(fichiers : `src/lib/qr.ts`, `src/app/(auth)/dons/slide/qr.ts` supprimé,
  et ses importateurs)*

### 2. Page publique `/installer`

- [ ] **T7** — Déclarer `{ path: "/installer" }` dans `routes.public` du manifeste `core`.
  *(fichier : `src/modules/core/manifest.ts`)*
- [ ] **T8** — Composant client `InstallGuide` :
  - une section par situation, avec étapes numérotées et icônes `lucide-react` ;
  - bouton « Installer Koinonia » si `canPrompt` ; après un refus, les étapes manuelles
    restent affichées ;
  - « Ouvrez dans Safari / Chrome » avec « Copier le lien » ;
  - « Autre appareil ? » (`<details>`), qui donne toutes les situations ;
  - QR code de `origin + "/installer"`, sur ordinateur seulement ;
  - « Partager ce lien » : `navigator.share`, sinon copie avec un toast ;
  - état « déjà installée » : lien vers « Mes notifications » si `signedIn` ;
  - icône de l'application en vigueur (`iconUrl` passé en prop) ;
  - tokens sémantiques uniquement.

  *(fichier : `src/components/install/InstallGuide.tsx`)*
- [ ] **T9** — Page serveur `/installer`, hors `(auth)` :
  - `metadata`, titre et description, pour l'aperçu de lien WhatsApp ;
  - `auth()` sans exigence : « Se connecter » ou « Retour à Koinonia » ;
  - `getAppIconVersion()` pour l'icône ;
  - mise en page sobre, inspirée de la page de connexion ;
  - aucune autre donnée lue.

  *(fichier : `src/app/installer/page.tsx`)*

### 3. Points d'entrée

- [ ] **T10** — Carte d'Accueil `InstallCard` (client) :
  - rien au premier rendu ;
  - affichée si `isInstallOffered` et si la carte n'est pas masquée ;
  - « Installer » (natif) ou « Voir comment » ;
  - « Plus tard » masque la carte pour 30 jours ;
  - insertion dans la page d'Accueil.

  *(fichiers : `src/app/(auth)/accueil/InstallCard.tsx`, `src/app/(auth)/accueil/page.tsx`)*
- [ ] **T11** — Ligne contextuelle « Installer l'application » dans `AccountActions`, variantes
  `menu` et `sheet` :
  - placée après les `ACCOUNT_PAGES` ;
  - icône `Download`, libellé et sous-titre `installHint` ;
  - affichée seulement si `isInstallOffered`, et seulement après la détection ;
  - appui : `promptInstall()` puis fermeture (`onNavigate`) si l'installation native est
    possible, sinon lien vers `/installer`.

  Ne modifier ni `MoreSheet.tsx` ni `NavPageList.tsx`. *(fichier : `src/components/AccountActions.tsx`)*
- [ ] **T12** [P] — Recherche : constante `INSTALL_PAGE`, ajoutée à `searchablePages`
  (contexte « Compte »). `ACCOUNT_PAGES` ne change pas. *(fichier : `src/lib/navigation.ts`)*
- [ ] **T13** [P] — « Mes notifications » : dans l'`Alert` `unavailable-ios-install` de
  `PushDeviceCard`, une phrase et un lien « Voir comment installer » vers `/installer`.
  *(fichier : `src/app/(auth)/profile/notifications/PushDeviceCard.tsx`)*
- [ ] **T14** [P] — Guide :
  - nouvelle entrée « Installer l'application » (catégorie « Profil », tous les rôles) ;
  - l'entrée « Notifications sur cet appareil » renvoie à la page.

  *(fichier : `src/components/GuideContent.tsx`)*

### 4. Tests

- [ ] **T15** [P] — `detect.test.ts` : corpus d'agents utilisateurs réels, une ligne par
  situation :
  - iPhone Safari, CriOS et FxiOS ;
  - iPad présenté comme un Mac ;
  - Android Chrome, Samsung Internet, WhatsApp et Facebook ;
  - Windows Chrome et Edge, macOS Safari, Firefox ;
  - `standalone`, avec et sans `canPrompt` ;
  - `isInstallOffered`, `installHint`.

  *(fichier : `src/lib/install/__tests__/detect.test.ts`)*
- [ ] **T16** [P] — `prompt-store.test.ts` :
  - capture et `preventDefault` ;
  - `accepted` et `dismissed` ;
  - `appinstalled` ;
  - `unavailable` ;
  - armement idempotent.

  *(fichier : `src/lib/install/__tests__/prompt-store.test.ts`)*
- [ ] **T17** [P] — `dismiss.test.ts` :
  - masquée pendant 30 jours, puis visible ;
  - stockage indisponible sans erreur.

  *(fichier : `src/lib/install/__tests__/dismiss.test.ts`)*
- [ ] **T18** — `AccountActions`, dans ses deux variantes :
  - ligne présente si l'installation est proposée ;
  - ligne absente si l'application est installée ou si le navigateur n'est pas compatible ;
  - appui natif : `promptInstall` appelé ;
  - sinon, lien vers `/installer`.

  *(fichier : `src/components/__tests__/AccountActions.install.test.tsx`)*
- [ ] **T19** — Routes et navigation :
  - `/installer` publique en GET (table de routes) ;
  - `route-exhaustiveness.test.ts` vert ;
  - `searchablePages` contient « Installer l'application » ;
  - instantané `layout-props` inchangé.

  *(fichiers : tests existants, et `src/lib/__tests__/module-routes.test.ts` si besoin)*

### 5. Documentation & livraison

- [ ] **T20** [P] — `CLAUDE.md` : une ligne sur `/installer` (page publique du noyau `core`) et
  sur la ligne contextuelle du menu du compte. Section « Design system », paragraphe
  Navigation.
- [ ] **T21** [P] — CHANGELOG, section « Non publié », entrée « Ajouté ».

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary`, seuil inchangé
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Recette sur appareils réels :
  - iPhone Safari, et lien ouvert depuis WhatsApp ;
  - iPad ;
  - Android Chrome (bouton natif) et Samsung Internet ;
  - Windows Edge, macOS Chrome, Firefox ;
  - application déjà installée : ligne absente du panneau « Plus » ;
  - « Plus tard » ;
  - QR code depuis l'ordinateur.
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (correspondance ci-dessous)
- [ ] PR ouverte vers `main`

## Correspondance critères d'acceptation → tâches

| Critère (spec) | Tâches |
|---|---|
| Page à une adresse stable, connecté ou non, sans donnée | T7, T9, T19 |
| iPhone/iPad Safari : 3 étapes et rappel sur les notifications | T1, T8, T15 |
| iPhone dans un autre navigateur : ouvrir dans Safari, copier le lien | T1, T8, T15 |
| iPad présenté comme un Mac reconnu | T1, T2, T15 |
| Android et ordinateur : bouton natif, sinon étapes manuelles | T3, T5, T8, T16 |
| Android dans un navigateur intégré : ouvrir dans Chrome | T1, T8, T15 |
| Navigateur non compatible : message et alternative | T1, T8, T15 |
| Application installée : « déjà installée », vers « Mes notifications » | T1, T3, T8 |
| « Autre appareil ? » donne toutes les situations | T8 |
| QR code sur ordinateur seulement | T6, T8 |
| « Partager ce lien » : partage natif ou copie | T8 |
| Carte d'Accueil affichée seulement si l'installation est possible | T1, T10 |
| « Plus tard » : 30 jours, par appareil | T4, T10, T17 |
| Points d'entrée : menu du compte, guide, « Mes notifications », recherche | T11, T12, T13, T14, T18, T19 |
| Illustrations avec l'icône en vigueur | T8, T9 |
