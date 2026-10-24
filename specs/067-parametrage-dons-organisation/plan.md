# Plan technique — Organisation de l'écran de paramétrage des dons

- **Spec associée** : `./spec.md`
- **Statut** : Terminé
- **Mis à jour le** : 2026-10-21

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/(auth)/dons` importe `@/modules/giving` (index) et
      `@/modules/giving/schemas` (schémas purs), comme aujourd'hui ; rien de neuf côté module
- [x] **Sécurité** : aucune route nouvelle ni modifiée ; `/dons` et `/dons/slide` gardent
      `requireChurchPermission("giving:manage", churchId)`
- [x] **Permissions** via `rolePermissions` : inchangées (aucune permission ajoutée)
- [x] **Validation** Zod : inchangée (`givingPageSchema` côté client et `PUT /api/giving`)
- [x] **Migration** Prisma : aucune, le schéma ne change pas
- [x] **Enums** : `GivingNameSize` reste importé depuis `@/generated/prisma/enums`
- [x] **UI** : `StatusChip`, `ConfirmModal`, `Button`, `Alert`, `Field` réutilisés ; aucun
      composant ajouté à `src/components/ui/`

## Approche générale

Réorganisation **purement client** de l'écran `/dons`, sans toucher au module, à l'API ni au
schéma. Trois chantiers indépendants :

1. **Publication en tête** : un bloc « Publication » en haut de l'écran, avec une pastille
   d'état calculée sur la version **enregistrée**, et une mention quand le brouillon diffère.
2. **Deux onglets par support**, « Page publique » et « Slide de projection », qui pilotent à la
   fois le formulaire et l'aperçu. L'aperçu de la slide réutilise la **vraie scène** de la slide
   (même composant, même ajustement), alimentée par le brouillon.
3. **Modifications non enregistrées** : comparaison du brouillon à la dernière version
   enregistrée, signal dans la barre d'enregistrement (déjà collante, au-dessus de la barre du
   bas depuis la PR #697), et garde à la sortie (lien interne, fermeture, rechargement).

Prérequis : la spec 066 (PR #697) mergée, car l'écran repose sur ses réglages du nom et du logo.
La branche `feat/parametrage-dons-organisation` part de `main` après ce merge.

## Modèle de données

[Aucun changement]

## API

[Aucun changement] — `PUT /api/giving`, `POST`/`DELETE`/`GET /api/giving/logo` sont réutilisés
tels quels. Pas de `npm run openapi` à prévoir.

## Services / logique métier

[Aucun changement côté module.] Les règles nouvelles sont des fonctions **pures** côté écran,
dans `src/app/(auth)/dons/` :

- `settings-state.ts`
  - `isDirty(draft, saved): boolean` — compare champ par champ le brouillon à la dernière version
    enregistrée (chaînes comparées telles quelles, IBAN comparé normalisé pour qu'un simple
    reformatage au blur ne compte pas comme une modification).
  - `publicationStatus(savedEnabled, draftEnabled)` →
    `{ tone, label, pending }` : « Publiée » / « Non publiée » (version enregistrée), et
    `pending` = « Sera publiée à l'enregistrement » / « Sera retirée à l'enregistrement » quand le
    brouillon diffère.
- `slide/slide-props.ts`
  - `toSlideProps(content, { churchName, publicUrl, logoSrc })` → props de la scène (nom et
    taille, logo, cible du QR code, adresse affichée, virement, sur place, ordre des chèques,
    verset). **Seule** traduction contenu → slide : utilisée par `/dons/slide` (contenu enregistré)
    et par l'aperçu (brouillon). C'est ce qui garantit « la slide projetée correspond à
    l'aperçu ».
- `leave-guard.ts`
  - `isGuardedNavigation(event, anchor, location): boolean` — vrai pour un clic gauche sans
    touche de modification, sur un lien de même origine, sans `target="_blank"` ni `download`,
    vers un autre chemin que l'écran courant.

## UI / composants

### Structure de l'écran (`GivingSettingsClient.tsx`)

```
PageHeader « Page de dons »
[Bloc Publication]  pastille Publiée/Non publiée · interrupteur « Publier la page »
                    · mention « Sera publiée à l'enregistrement » si en attente
                    · liens « Voir la page publique » / « Slide de projection »
[Alerte adresse comptable]           (inchangée, PR #697)
[Onglets : Page publique | Slide de projection]
┌ formulaire de l'onglet ───────────┐ ┌ aperçu de l'onglet ─────────┐
│ Page : Introduction, Don en ligne,│ │ Page : aperçu actuel        │
│  Virement, Sur place, Reçu fiscal,│ │ Slide : scène 16:9 réduite  │
│  Nom et logo (page + dépôt logo), │ │                             │
│  Verset et pied de page           │ │                             │
│ Slide : Nom (affichage, taille),  │ │                             │
│  Logo (affichage + miniature +    │ │                             │
│  « Changer le logo »), Verset     │ │                             │
│  projeté (lecture + « Modifier le │ │                             │
│  verset »), Adresse courte        │ │                             │
└───────────────────────────────────┘ └─────────────────────────────┘
[Barre collante] « Modifications non enregistrées » · [Enregistrer]
```

- **Bloc Publication** : remplace la section « Page active » ; l'introduction devient une section
  « Introduction » de l'onglet Page. Placé avant l'alerte comptable pour rester visible sans
  défilement sur téléphone (390 × 844). `StatusChip` `success` « Publiée » / `neutral` « Non
  publiée ».
- **Onglets** : état local (`useState`), rendus comme un groupe de boutons `role="tablist"` /
  `role="tab"` / `aria-selected`, sur le modèle visuel des onglets Paramètres/Aperçu existants.
  Le composant `Tabs` de `ui/` est écarté : il navigue par URL (voir Décisions). L'onglet actif
  est mémorisé dans l'URL (`?support=slide`) via `history.replaceState`, pour qu'un rechargement
  ou le lien « Paramétrage » de `/dons/slide` (`/dons?support=slide`) ouvre le bon onglet.
- **Mobile** : la bascule existante « Paramètres / Aperçu » est conservée sous les onglets de
  support ; l'aperçu montré est celui de l'onglet actif.
- **Logo** : le dépôt/retrait reste dans l'onglet Page (section « Nom et logo »). L'onglet Slide
  montre l'interrupteur « Afficher le logo », une miniature et un bouton « Changer le logo » qui
  bascule sur l'onglet Page et y fait défiler jusqu'au bloc logo. Message permanent du bloc logo :
  « Enregistré dès le dépôt, indépendamment du bouton Enregistrer » ; toasts « Logo déposé et
  enregistré » / « Logo retiré ». `ChurchIdentitySection` est scindée : `LogoUpload` (dépôt,
  retrait) et `SupportIdentity` (interrupteurs et taille d'un support).
- **Verset** : édité dans l'onglet Page (section « Verset et pied de page », inchangée). L'onglet
  Slide l'affiche en lecture avec « Modifier le verset » (même mécanique que « Changer le logo »)
  ou « Aucun verset » si vide.
- **Adresse courte** : déplacée dans l'onglet Slide.

### Aperçu de la slide

- `GivingSlide.tsx` est scindé :
  - `GivingSlideStage` — la scène 1920 × 1080, l'ajustement (`fitContent`) et la mise à
    l'échelle (`scaleToStage`), exposant sa scène par `ref` pour l'export ;
  - `GivingSlide` — la page `/dons/slide` : `GivingSlideStage` + plein écran + export PNG
    (comportement inchangé).
- `SlidePreview` (paramétrage) rend `GivingSlideStage` avec `toSlideProps(brouillon, …)`. Le
  QR code est calculé côté client (`qrPath`, mémoïsé sur la cible) : seule l'adresse courte le
  fait changer. Le logo de l'aperçu est servi par la route authentifiée du paramétrage
  (`settingsLogoSrc`), la route publique répondant 404 tant que la page n'est pas publiée.
- `fitContent` dépend aussi de `logoSrc`, du verset et des moyens de don : l'aperçu se réajuste
  à chaque frappe ; un délai de 150 ms (debounce) évite de mesurer à chaque caractère.

### Modifications non enregistrées

- `saved` (état) = brouillon de la dernière version enregistrée (au chargement, puis après chaque
  `PUT` réussi) ; `dirty = isDirty(draft, saved)`.
- Barre collante : « Modifications non enregistrées » (point `warning` + texte) quand `dirty`,
  sinon « Tout est enregistré » (`ink-muted`). Le bouton « Enregistrer » reste actif dans les
  deux cas (première configuration à partir des textes par défaut).
- Échec d'enregistrement : `saved` inchangé, donc le signal reste et la pastille de publication
  garde la version enregistrée.
- Dépôt/retrait du logo : ne touche ni `draft` ni `saved` (le logo n'est pas dans le brouillon).
- **Garde à la sortie** (`useLeaveGuard(dirty)`) :
  - `beforeunload` (fermeture, rechargement, lien externe) avec `preventDefault()`, posé
    uniquement quand `dirty` ;
  - écouteur `click` en **capture** sur `document` : si `isGuardedNavigation`, on annule le clic
    (`preventDefault` + `stopPropagation`, avant le gestionnaire de `next/link` posé à la racine
    React) et on ouvre un `ConfirmModal` « Quitter sans enregistrer ? » ; « Quitter » →
    `router.push(href)`, « Rester » → rien.

## Décisions & alternatives écartées

- **Choix** : onglets par support pilotant formulaire **et** aperçu — *Pourquoi* : répond au
  regroupement exigé par la spec sans allonger encore la colonne ; l'aperçu de droite reste
  celui de ce qu'on règle.
- **Écarté** : une seule colonne regroupée par support (« Page » puis « Slide ») avec deux
  aperçus empilés — *Raison* : écran déjà long (2 300 px sur ordinateur) ; l'aperçu de la slide
  serait loin de ses réglages.
- **Écarté** : composant `ui/Tabs` — *Raison* : onglets de navigation par URL (`Link`), donc
  rechargement de la page serveur et perte du brouillon ; ici les onglets sont un état local.
- **Choix** : réutiliser la vraie scène de la slide pour l'aperçu, et une seule fonction
  `toSlideProps` — *Pourquoi* : critère « la slide projetée correspond à l'aperçu » garanti par
  construction, sans dupliquer l'ajustement mesuré (spec 066).
- **Écarté** : aperçu en image (export PNG à la volée) — *Raison* : coûteux à chaque frappe,
  et nécessite le logo public (404 tant que la page n'est pas publiée).
- **Choix** : garde de navigation par écouteur de clic en capture — *Pourquoi* : Next 16
  (App Router) n'offre pas de blocage global de la navigation ; `Link.onNavigate` n'existe que
  lien par lien, or la sidebar, la barre du bas et la palette sont hors de l'écran.
- **Écarté** : enregistrement automatique — *Raison* : hors périmètre (spec) et contraire au
  choix de publier d'un seul geste une page complète.
- **Choix** : publication enregistrée au bouton (décision de la spec), pastille sur la version
  enregistrée — *Pourquoi* : la pastille répond à « est-ce que les gens voient la page ? » ; la
  mention « en attente » couvre l'écart avec le brouillon.

## Risques & points d'attention

- **Bouton « Précédent » du navigateur** : un retour arrière dans l'historique de l'application
  (`popstate`) n'est pas intercepté. La spec ne l'exige pas (lien, fermeture, rechargement) ;
  limite consignée dans la PR. Le `replaceState` de l'onglet n'ajoute pas d'entrée d'historique.
- **Palette de recherche (`⌘K`)** : elle navigue par `router.push`, sans clic sur un lien ; elle
  échappe donc à la garde. Même limite que ci-dessus, à consigner.
- **Coût de l'aperçu** : l'ajustement mesure le DOM ; debounce de 150 ms et ajustement seulement
  quand l'onglet Slide est affiché (scène non montée sinon).
- **Ordre capture / React** : l'écouteur en capture sur `document` passe avant la racine React ;
  à vérifier manuellement avec la sidebar, la barre du bas, le fil d'Ariane et le lien
  « Slide de projection ».
- **Lien « Voir la page publique »** (`target="_blank"`) : non gardé, il ouvre un nouvel onglet
  sans quitter l'écran.
- **Export PNG** : `useSnapshotExport` doit continuer de capturer la scène après la scission
  (ref transmise par `GivingSlideStage`).

## Stratégie de tests

Vitest (environnement node, fonctions pures) :

- `settings-state.test.ts`
  - `isDirty` : faux au chargement ; vrai après une saisie ; faux après retour à la valeur
    d'origine ; IBAN reformaté (espaces) non compté ; booléens et tailles du nom comptés.
  - `publicationStatus` : quatre combinaisons enregistré × brouillon, libellés et tonalités.
- `slide-props.test.ts` : `toSlideProps` — nom masqué ⇒ taille `null` ; logo seulement si
  affiché **et** déposé ; cible du QR = adresse courte sinon URL publique ; ordre des chèques
  seulement si « sur place » activé ; verset absent si vide. Test de non-régression : la page
  `/dons/slide` et l'aperçu passent par la même fonction (import vérifié dans le test de la
  page si besoin).
- `leave-guard.test.ts` : `isGuardedNavigation` — clic gauche interne gardé ; clic avec
  Ctrl/Meta/Shift/milieu, `target="_blank"`, `download`, autre origine, même chemin : non gardés.
- Tests existants inchangés et verts (`slide-fit.test.ts`, `schemas.test.ts`, routes).

Vérification manuelle (ordinateur 1440 px et téléphone 390 px) :

- pastille visible sans défilement ; mention « en attente » ; pastille inchangée après un échec ;
- onglets, `?support=slide`, lien « Paramétrage » de `/dons/slide` ;
- aperçu de la slide = slide réelle après enregistrement (nom Grand long, logo, adresse longue) ;
- signal de modifications, retour à l'origine, garde sur sidebar / barre du bas / fil d'Ariane /
  fermeture / rechargement, aucune garde sans modification ;
- logo déposé avec modifications en attente : celles-ci restent signalées ;
- export PNG et plein écran de `/dons/slide` inchangés.
