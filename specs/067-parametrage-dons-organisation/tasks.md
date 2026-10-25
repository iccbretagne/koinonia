# Tâches — Organisation de l'écran de paramétrage des dons

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] PR #697 (spec 066) mergée dans `main`
- [x] Branche créée depuis `main` : `feat/parametrage-dons-organisation`
- [x] Migration Prisma : sans objet (schéma inchangé)

## Tâches

### 1. Données & migration

Sans objet : aucun changement de schéma.

### 2. Logique pure de l'écran

- [x] **T1** [P] — `isDirty(draft, saved)` et `publicationStatus(savedEnabled, draftEnabled)`.
  - `isDirty` compare les champs un par un, et l'IBAN après normalisation.
  - `publicationStatus` renvoie `{ tone, label, pending }` : « Publiée » ou « Non publiée », et
    « Sera publiée / retirée à l'enregistrement ».
  - *(fichier : `src/app/(auth)/dons/settings-state.ts`)*
- [x] **T2** [P] — `toSlideProps(content, { churchName, publicUrl, logoSrc })`. C'est la seule
  traduction contenu → props de la scène : nom et taille, logo, cible du QR code, adresse
  courte, virement, sur place, ordre des chèques, verset.
  *(fichier : `src/app/(auth)/dons/slide/slide-props.ts`)*
- [x] **T3** [P] — `isGuardedNavigation(event, anchor, location)`. Un lien n'est gardé que si
  toutes ces conditions sont remplies :
  - clic gauche sans touche de modification ;
  - même origine ;
  - ni `target="_blank"`, ni `download` ;
  - chemin différent de l'écran courant.

  *(fichier : `src/app/(auth)/dons/leave-guard.ts`)*

### 3. API (route handlers)

Sans objet : `PUT /api/giving` et `/api/giving/logo` restent inchangés, et `docs/openapi.json` ne
bouge pas.

### 4. UI

- [x] **T4** — Scinder la slide en deux :
  - `GivingSlideStage` : la scène 1920 × 1080, `fitContent` et `scaleToStage`. Elle transmet la
    `ref` de la scène pour l'export. Son ajustement suit aussi `logoSrc`, le verset et les
    moyens de don.
  - `GivingSlide` : `GivingSlideStage`, le plein écran et l'export PNG, sans changement de
    comportement.

  *(fichiers : `src/app/(auth)/dons/slide/GivingSlideStage.tsx`, `GivingSlide.tsx`)*
- [x] **T5** — `/dons/slide` passe par `toSlideProps` (T2). Le lien « Paramétrage » pointe vers
  `/dons?support=slide`. *(fichier : `src/app/(auth)/dons/slide/page.tsx`)*
- [x] **T6** — Scinder `ChurchIdentitySection` en deux :
  - `LogoUpload` : dépôt et retrait, toasts « Logo déposé et enregistré » et « Logo retiré », et
    la mention permanente « Enregistré dès le dépôt, indépendamment du bouton Enregistrer ».
  - `SupportIdentity` : interrupteurs et taille du nom pour un support.

  *(fichiers : `src/app/(auth)/dons/LogoUpload.tsx`, `SupportIdentity.tsx`, suppression de
  `ChurchIdentitySection.tsx`)*
- [x] **T7** — Bloc **Publication** en tête de l'écran :
  - il remplace la section « Page active » et se place avant l'alerte comptable ;
  - il contient une `StatusChip` (version enregistrée), l'interrupteur « Publier la page », la
    mention « en attente » (T1) et les liens « Voir la page publique » et « Slide de
    projection » ;
  - l'introduction devient la section « Introduction » de l'onglet Page.

  *(fichiers : `src/app/(auth)/dons/PublicationBlock.tsx`, `GivingSettingsClient.tsx`)*
- [x] **T8** — Onglets **Page publique** et **Slide de projection** :
  - un état local, `role="tablist"` / `tab` / `aria-selected` ;
  - l'onglet actif est gardé dans `?support=` via `history.replaceState`, et lu au chargement ;
  - la bascule mobile « Paramètres / Aperçu » est conservée ;
  - l'aperçu affiché est celui de l'onglet actif.

  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*
- [x] **T9** — Contenu de l'onglet **Page** :
  - sections Introduction, Don en ligne, Virement, Sur place, Reçu fiscal ;
  - « Nom et logo » (avec `LogoUpload` et `SupportIdentity` pour la page) ;
  - Verset et pied de page.

  Le bloc logo et le champ verset portent un `id` qui sert de cible aux renvois de l'onglet
  Slide. *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*
- [x] **T10** — Contenu de l'onglet **Slide** :
  - `SupportIdentity` pour la slide, une miniature du logo et « Changer le logo » ;
  - le verset projeté en lecture, avec « Modifier le verset », ou « Aucun verset » ;
  - l'adresse courte.

  Chaque renvoi bascule sur l'onglet Page, fait défiler jusqu'à sa cible et y place le focus.
  *(fichiers : `src/app/(auth)/dons/SlideSettings.tsx`, `GivingSettingsClient.tsx`)*
- [x] **T11** — Aperçu de la slide `SlidePreview` :
  - il utilise `GivingSlideStage` avec `toSlideProps(brouillon, …)` et `settingsLogoSrc` ;
  - le QR code (`qrPath`) est mémoïsé sur sa cible ;
  - l'aperçu ne suit le brouillon qu'après 150 ms sans saisie ;
  - la scène n'est montée que sur l'onglet Slide.

  *(fichier : `src/app/(auth)/dons/SlidePreview.tsx`)*
- [x] **T12** — **Modifications non enregistrées** :
  - un état `saved`, posé au chargement et après chaque `PUT` réussi, jamais après un échec ;
  - `dirty = isDirty(draft, saved)` ;
  - la barre collante affiche « Modifications non enregistrées » ou « Tout est enregistré » ;
  - le bouton « Enregistrer » reste toujours actif ;
  - le dépôt ou le retrait du logo ne touche ni `draft` ni `saved`.

  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*
- [x] **T13** — `useLeaveGuard(dirty)` :
  - `beforeunload` n'est posé que si `dirty` ;
  - un écouteur `click` en capture sur `document` (T3) annule le clic et ouvre un
    `ConfirmModal` « Quitter sans enregistrer ? » ;
  - « Quitter sans enregistrer » mène à `router.push(href)`, « Annuler » (libellé fixe de
    `ConfirmModal`) laisse sur l'écran ;
  - les écouteurs sont retirés au démontage.

  *(fichiers : `src/app/(auth)/dons/use-leave-guard.ts`, `GivingSettingsClient.tsx`)*

### 5. Tests

- [x] **T14** [P] — `isDirty` :
  - faux au chargement, vrai après une saisie ;
  - faux après retour à la valeur d'origine ;
  - IBAN reformaté non compté ;
  - booléens et taille du nom comptés.

  `publicationStatus` : les quatre combinaisons, avec libellés et tonalités.
  *(fichier : `src/app/(auth)/dons/__tests__/settings-state.test.ts`)*
- [x] **T15** [P] — `toSlideProps` :
  - nom masqué ⇒ taille `null` ;
  - logo seulement s'il est affiché et déposé ;
  - cible du QR code = adresse courte, à défaut l'URL publique ;
  - ordre des chèques seulement si « sur place » est activé ;
  - verset vide ⇒ absent.

  *(fichier : `src/app/(auth)/dons/slide/__tests__/slide-props.test.ts`)*
- [x] **T16** [P] — `isGuardedNavigation` :
  - gardé : clic gauche sur un lien interne ;
  - non gardés : Ctrl, Meta, Shift, clic du milieu, `target="_blank"`, `download`, autre
    origine, même chemin.

  *(fichier : `src/app/(auth)/dons/__tests__/leave-guard.test.ts`)*
- [x] **T17** — Vérification manuelle (`npm run dev`, compte `admin`), sur ordinateur (1440 px)
  et sur téléphone (390 px) :
  - la pastille est visible sans défiler, la mention « en attente » apparaît, et la pastille ne
    change pas après un enregistrement refusé (IBAN invalide) ;
  - les onglets, `?support=slide` et le lien « Paramétrage » de `/dons/slide` ouvrent le bon
    onglet ;
  - l'aperçu de la slide est identique à la slide réelle après enregistrement (nom long en
    Grand, logo, adresse longue) ;
  - le signal de modifications apparaît, et disparaît au retour à l'origine ;
  - la garde se déclenche depuis la sidebar, la barre du bas, le fil d'Ariane, à la fermeture
    et au rechargement, et jamais sans modification ;
  - un logo déposé alors que des modifications attendent laisse ces modifications signalées ;
  - le plein écran et l'export PNG de `/dons/slide` fonctionnent comme avant ;
  - `git checkout next-env.d.ts` à la fin.

### 6. Documentation

- [x] **T18** [P] — Mettre à jour :
  - le CHANGELOG, entrée « Non publié » ;
  - le paragraphe « Spécificités du module dons » de `CLAUDE.md` et de `docs/auth.md`, pour
    l'organisation de l'écran (publication en tête, onglets, aperçu de la slide).

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] `npm run build` (frontière client/serveur), puis `git checkout next-env.d.ts`
- [x] Tous les critères d'acceptation de `spec.md` sont satisfaits, et la spec passe au statut
      `Implémentée`
- [ ] PR ouverte vers `main`, qui signale les limites : bouton « Précédent » et palette ⌘K non
      gardés

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Statut visible en tête sans défiler | T7, T17 |
| Publication séparée de l'introduction | T7, T9 |
| Changement de publication en attente, statut de la version enregistrée | T1, T7, T14, T17 |
| Réglages de la slide regroupés, verset montré avec un renvoi | T8, T10 |
| Aperçu 16:9 en direct, même ajustement | T4, T11, T17 |
| Slide projetée = aperçu | T2, T5, T15, T17 |
| Signal visible au défilement, jamais sous la barre du bas | T12, T17 |
| Retour à l'origine ⇒ plus de signal | T1, T14 |
| Garde à la sortie (lien, fermeture, rechargement) ; aucune sans modification | T3, T13, T16, T17 |
| Logo enregistré aussitôt, modifications en attente préservées, mention | T6, T12, T17 |
| Enregistrement refusé ⇒ signal maintenu | T12, T17 |
| Page publique et slide inchangées | T4, T5, T15, T17 |
