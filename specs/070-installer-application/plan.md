# Plan technique — Installer Koinonia sur son appareil

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-27

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouveau service de module ; la page lit la version de
  l'icône par `@/modules/core` (index), comme le root layout (spec 069).
- [x] **Sécurité** : aucune route API ajoutée. La seule nouvelle adresse est une page publique,
  sans donnée d'église ni de personne, déclarée dans `routes.public` du manifeste `core`
  (ADR-0012). Rien n'est évalué dans une église.
- [x] **Permissions** : aucune ; la fonctionnalité est ouverte à tous.
- [x] **Validation** : aucune mutation serveur. Le masquage de la carte reste sur l'appareil.
- [x] **Migration** : aucune, le schéma ne change pas.
- [x] **Enums** : aucun.
- [x] **UI** : `PageHeader`, `Button`, `Alert`, `useToast`, `buttonClasses` ; les icônes viennent de
  `lucide-react`. Le QR code réutilise la bibliothèque `qrcode`, déjà utilisée par la slide de dons.

## Approche générale

Tout se passe **dans le navigateur**. L'installation d'une application web dépend de
l'appareil, du navigateur et de signaux que seul le client connaît :

- l'agent utilisateur ;
- `maxTouchPoints`, pour reconnaître un iPad qui se présente comme un Mac ;
- `display-mode: standalone`, quand Koinonia est déjà ouverte comme application installée ;
- l'événement `beforeinstallprompt`, qui permet d'ouvrir la fenêtre d'installation native.

Le fil directeur :

1. **Une fonction pure de détection**, `installTarget(env)`, renvoie la situation parmi une
   liste fermée. Elle est testable sans navigateur, comme `pushDeviceState` (spec 068).
2. **Une capture globale et précoce de `beforeinstallprompt`**.
   - Le navigateur émet cet événement **une seule fois**, souvent avant que la page ou la carte
     ne soit montée.
   - Un petit magasin client est armé par le composant déjà présent dans le root layout
     (`ServiceWorkerRegistration`). Il garde l'événement et le rend disponible à la page et à la
     carte d'Accueil.
3. **Un composant client « guide d'installation »**, partagé par la page publique `/installer`
   et par la carte d'Accueil. Il affiche les étapes de la situation détectée, et toutes les
   autres sous « Autre appareil ? ».
4. **Aucune persistance serveur** : « Plus tard » est retenu sur l'appareil, en `localStorage`,
   avec une date d'expiration à 30 jours. La spec demande un masquage par appareil.

## Modèle de données

Aucun changement.

## API

Aucun endpoint ajouté ni modifié.

**Nouvelle adresse publique** :

| Adresse | Accès | Déclaration |
|---|---|---|
| `/installer` | public, page | `routes.public` du manifeste `core`, `{ path: "/installer" }` |

La page vit **hors du groupe `(auth)`**, dans `src/app/installer/page.tsx`. Elle n'a donc pas
la coquille authentifiée ; elle a sa propre mise en page, sobre, sur le modèle de la page de
connexion.

## Services / logique métier

Pas de service de module : il n'y a ni donnée ni règle métier côté serveur. La logique est
cliente et pure, dans `src/lib/install/` :

- **`detect.ts`** (pur, sans DOM) :
  - `detectPlatform(userAgent, maxTouchPoints)` renvoie la plateforme, l'un de :
    - `ios`, iPad présenté comme un Mac compris ;
    - `android` ;
    - `desktop`.
  - `detectBrowser(userAgent)` renvoie le navigateur, l'un de :
    - `safari` ;
    - `chrome`, `edge`, `samsung` ;
    - `firefox` ;
    - `in-app` : WhatsApp, Facebook, Instagram, Messenger, ou une WebView Android repérée par
      `; wv)` ;
    - `ios-other` : CriOS, FxiOS ou EdgiOS ;
    - `other`.
  - `installTarget({ platform, browser, standalone, canPrompt })` renvoie l'une des situations
    de la spec :
    - `installed` ;
    - `ios-safari`, `ios-open-in-safari` ;
    - `android-prompt`, `android-manual`, `android-open-in-chrome` ;
    - `desktop-prompt`, `desktop-manual` ;
    - `unsupported`.
  - `isInstallOffered(target)` dit si la carte d'Accueil doit s'afficher.
  - `detectIos`, aujourd'hui dans `profile/notifications/push-device-state.ts`, est
    **déplacé** ici. L'ancien fichier le réexporte, pour ne pas dupliquer la règle de l'iPad
    présenté comme un Mac.
- **`prompt-store.ts`** (client) :
  - `armInstallPrompt()` est appelé une fois par `ServiceWorkerRegistration`. Il écoute
    `beforeinstallprompt`, appelle `preventDefault()` et garde l'événement. Il écoute aussi
    `appinstalled`, qui vide l'événement et note que l'application est installée.
  - `subscribe` et `getSnapshot` sont pensés pour `useSyncExternalStore`.
  - `promptInstall()` renvoie `"accepted" | "dismissed" | "unavailable"`.
- **`dismiss.ts`** (client) : `isInstallCardDismissed(now)` et `dismissInstallCard(now)`.
  - La clé `localStorage` est `koinonia-install-dismissed-until`.
  - L'accès est protégé par `try/catch` : navigation privée stricte, stockage indisponible.
- **QR code** : `qrPath` (`src/app/(auth)/dons/slide/qr.ts`) est **déplacé** dans
  `src/lib/qr.ts`, pour être partagé. La slide de dons l'importe depuis ce nouvel emplacement.

## UI / composants

- **`src/app/installer/page.tsx`** (serveur) :
  - `metadata` : titre « Installer Koinonia » et description, pour un aperçu de lien correct
    dans WhatsApp ;
  - lit `getAppIconVersion()` pour afficher l'icône en vigueur (spec 069) ;
  - lit la session **sans l'exiger** (`auth()`) :
    - sans session : lien « Se connecter » ;
    - avec session : lien « Retour à Koinonia ».
  - Aucune autre donnée n'est lue.
- **`src/components/install/InstallGuide.tsx`** (client) :
  - détecte la situation au montage, puis l'actualise par le magasin `beforeinstallprompt` ;
  - affiche **une section par situation**, avec des étapes numérotées et des icônes
    `lucide-react` :
    - `Share` et `SquarePlus` pour Safari ;
    - `EllipsisVertical` pour le menu Android ;
    - `MonitorDown` pour la barre d'adresse.
  - Les illustrations sont des schémas simples (pastille d'étape et icône du bouton à
    toucher), pas des captures d'écran : la spec les veut génériques.
  - Le bouton **« Installer Koinonia »** (`Button`) apparaît quand `canPrompt` est vrai. Après un
    refus, il reste affiché avec les étapes manuelles.
  - **« Ouvrez dans Safari / Chrome »** : bouton « Copier le lien », par
    `navigator.clipboard`, avec repli sur la sélection d'un champ en lecture seule ;
  - **« Autre appareil ? »** : `<details>` qui liste les étapes de toutes les situations ;
  - **QR code** : SVG `qrPath(origin + "/installer")`, affiché seulement si
    `platform === "desktop"` ;
  - **« Partager ce lien »** :
    - `navigator.share({ title, text, url })` quand il existe ;
    - sinon la copie du lien, avec un toast ;
    - texte d'accompagnement : « Installe Koinonia sur ton téléphone en 1 minute : ».
  - **État « déjà installée »** : message et lien vers `/profile/notifications`, seulement si une
    session existe (prop `signedIn`).
- **Carte d'Accueil** : `src/app/(auth)/accueil/InstallCard.tsx` (client), insérée dans la page
  d'Accueil existante.
  - Elle ne rend **rien** côté serveur ni avant la détection. Elle évite ainsi un affichage
    furtif et une différence d'hydratation.
  - Elle s'affiche si `isInstallOffered(target)` et `!isInstallCardDismissed(now)`.
  - Elle propose « Installer » quand l'installation native est possible, sinon « Voir comment ».
  - « Plus tard » masque la carte pour 30 jours.
- **Points d'entrée** :
  - **Menu du compte** : entrée « Installer l'application » (icône `Download`). Elle est
    ajoutée à la **variante `menu`** d'`AccountActions` (menu de l'avatar, ordinateur) et à la
    **recherche** (`searchablePages`), au moyen d'une constante dédiée `INSTALL_PAGE`.
    `ACCOUNT_PAGES` et la variante `sheet` (panneau « Plus » mobile) ne changent pas. Voir
    *Décisions*.
  - **« Mes notifications »** : l'`Alert` « Installez Koinonia sur l'écran d'accueil » de
    `PushDeviceCard` (état `unavailable-ios-install`) garde une phrase et gagne un lien « Voir
    comment installer » vers `/installer`.
  - **Guide** : l'entrée « Notifications sur cet appareil » renvoie à la page, et une entrée
    « Installer l'application » est ajoutée (catégorie « Profil », tous les rôles).
- **Service worker** : rien à changer. Le manifeste dynamique (spec 069) et le service worker
  suffisent déjà aux critères d'installabilité de Chrome et d'Edge.

## Décisions & alternatives écartées

- **Choix** : détection et installation entièrement côté client, sans route ni table.
  - *Pourquoi* : seuls le navigateur et l'appareil savent si l'installation est possible ou
    déjà faite. Le masquage est par appareil, selon la spec.
  - **Écarté : mémoriser « Plus tard » en base, par utilisateur**. *Raison* : la spec veut un
    masquage par appareil ; une ligne par personne masquerait aussi la carte sur un autre
    téléphone.
- **Choix** : capture de `beforeinstallprompt` dans `ServiceWorkerRegistration`, déjà monté dans
  le root layout.
  - *Pourquoi* : l'événement n'est émis qu'une fois, tôt. L'écouter dans la page ou la carte le
    ferait souvent manquer.
- **Choix** : page hors `(auth)`, publique.
  - *Pourquoi* : la spec veut un lien à envoyer avant la première connexion.
  - **Écarté : page dans `(auth)` avec une exception dans le proxy**. *Raison* : la coquille
    authentifiée exige une session et une église.
- **Choix** : l'entrée « Installer l'application » est ajoutée au menu de l'avatar et à la
  recherche, **pas au panneau « Plus » mobile**.
  - *Pourquoi* : la présentation du panneau « Plus » est figée. Sur mobile, la carte d'Accueil,
    « Mes notifications », le guide et la recherche couvrent déjà le besoin.
  - Cela s'écarte de la lettre du critère « depuis le menu du compte » sur mobile. Voir
    *Questions*.
- **Choix** : illustrations en icônes et pastilles d'étape.
  - **Écarté : captures d'écran par version d'iOS ou d'Android**. *Raison* : exclues par la spec,
    elles vieillissent à chaque mise à jour du système.
- **Choix** : réutiliser `qrcode`, déjà en dépendance, en déplaçant `qrPath` dans `src/lib/`.
  - **Écarté : un service de QR code en ligne**. *Raison* : dépendance externe et fuite de
    l'adresse de l'instance.

## Risques & points d'attention

- **Détection par agent utilisateur** : elle est fragile par nature.
  - Atténuations :
    - liste fermée de situations, avec un repli vers les étapes manuelles ;
    - « Autre appareil ? » toujours disponible ;
    - tests sur un corpus d'agents utilisateurs réels.
  - Les navigateurs intégrés (WhatsApp sur Android) ne déclarent pas tous un marqueur : un
    navigateur non reconnu tombe dans `android-manual`, qui reste juste.
- **`beforeinstallprompt`** : il n'existe pas sur Safari ni sur Firefox. Chrome ne l'émet que si
  l'application n'est pas installée et si les critères d'installabilité sont remplis. Sans
  l'événement, la page montre les étapes manuelles, ce qui correspond au comportement attendu.
- **CSP** : aucun script externe ni `eval`. Le QR code est rendu en SVG en ligne, déjà admis par
  la politique actuelle (ADR-0022).
- **Aperçu de lien WhatsApp** : il dépend des métadonnées Open Graph. Titre et description
  suffisent, sans image dédiée.
- **Hydratation** : la carte et la détection n'existent qu'au client. Rien ne s'affiche avant le
  montage, ce qui évite les écarts entre le rendu serveur et le client.

## Stratégie de tests

Vitest :

- **`src/lib/install/__tests__/detect.test.ts`** : tableau d'agents utilisateurs réels, pour
  chaque situation :
  - iPhone Safari ;
  - iPhone CriOS et FxiOS ;
  - iPad présenté comme un Mac (`maxTouchPoints > 1`) ;
  - Android Chrome, Samsung Internet ;
  - WhatsApp et Facebook sur Android ;
  - Windows Chrome et Edge, macOS Safari, Firefox ;
  - `standalone` ;
  - avec et sans `canPrompt`.
  - `isInstallOffered` vaut faux pour `installed` et `unsupported`.
- **`dismiss.test.ts`** :
  - masqué pendant 30 jours, puis visible ;
  - stockage indisponible : la carte reste visible et aucune erreur n'est levée.
- **`prompt-store.test.ts`** :
  - l'événement est capturé et `preventDefault` est appelé ;
  - `promptInstall` renvoie `accepted` ou `dismissed` ;
  - `appinstalled` vide l'événement ;
  - sans événement, `promptInstall` renvoie `unavailable`.
- **Routes** :
  - `route-exhaustiveness.test.ts` couvre `/installer` (manifeste `core`) ;
  - un test de la table de routes vérifie que `/installer` est publique en GET.
- **Navigation** :
  - instantané `layout-props` inchangé pour le panneau « Plus » ;
  - un test de `searchablePages` vérifie la présence de « Installer l'application ».
- **QR code** : les tests existants de la slide de dons passent après le déplacement de `qrPath`.
- **Hors Vitest** (recette sur appareils réels) :
  - iPhone Safari, puis le lien ouvert depuis WhatsApp ;
  - iPad ;
  - Android Chrome (bouton natif) et Samsung Internet ;
  - Windows Edge, macOS Chrome, Firefox ;
  - application déjà installée ;
  - « Plus tard ».

## Questions

- **Panneau « Plus » mobile** : faut-il y ajouter la ligne « Installer l'application » ? Ce
  plan ne le fait pas, pour respecter la consigne de ne pas toucher à sa présentation. Sur
  mobile, la page reste atteignable par la carte d'Accueil, « Mes notifications », le guide et
  la recherche.
