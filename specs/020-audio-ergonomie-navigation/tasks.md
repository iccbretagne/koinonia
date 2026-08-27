# Tâches — Ergonomie et navigation du module audio

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Une partie du périmètre est déjà livrée (commit `43e32e4` — entrée de navigation « Audio » et
> lien de configuration) : voir `plan.md` § « Constat préalable ». Ce fichier ne liste que le
> reste du travail. Ordre : migration → services → API → UI → tests. Les tâches `[P]` touchent
> des fichiers indépendants et sont parallélisables entre elles.

## Prérequis

- [ ] Branche `feat/audio-cultes-publication` à jour (le module 020 s'implémente dessus, pas de
      branche dédiée — voir `feedback_feature_branch_strategy`)

## Tâches

### 1. Données & migration

- [x] **T001** — Ajouter `type String @default("AUTRE")` au modèle `AudioService` dans
      `prisma/schema.prisma`, juste après `speaker` (voir `plan.md` § Modèle de données).
      *(fichier : `prisma/schema.prisma`)*
- [x] **T002** — Générer la migration Prisma (`npm run db:migrate` avec un nom explicite, ex.
      `add_audio_service_type`) et vérifier qu'elle s'applique proprement sur une base locale à
      jour. Décider en l'exécutant si un backfill vers `"CULTE"` des lignes déjà rattachées à un
      événement `CULTE` est nécessaire selon le volume réel en base (`plan.md` § Risques).
      *(fichier : `prisma/migrations/…`)*

### 2. Logique métier (services)

- [x] **T003** — `src/modules/audio/services/service.ts` : `CreateAudioServiceInput` et
      `UpdateAudioServiceInput` gagnent `type?: string`. Dans `createAudioService`, si
      `planningEventId` est fourni, lire `type` sur l'`Event` rattaché (écrase toute valeur
      saisie manuellement) ; sinon utiliser la valeur fournie ou `"AUTRE"`.
      *(fichier : `src/modules/audio/services/service.ts`)*
- [x] **T004** — Même fichier : `updateAudioService` re-dérive `type` depuis l'événement quand
      `planningEventId` change (rattachement a posteriori).
      *(fichier : `src/modules/audio/services/service.ts`)*
- [x] **T005** [P] — `src/modules/audio/services/tokens.ts` : ajouter
      `buildPublicAudioUrl(token: string): string` (retourne `` `/ecouter/${token}` ``),
      exportée par `src/modules/audio/index.ts`. Remplacer l'occurrence en dur dans
      `src/app/api/events/[eventId]/star-view/route.ts` par cet appel.
      *(fichiers : `src/modules/audio/services/tokens.ts`, `src/modules/audio/index.ts`,
      `src/app/api/events/[eventId]/star-view/route.ts`)*

### 3. API (route handlers)

- [x] **T006** — `src/app/api/audio/services/[id]/route.ts` : le schéma Zod du `PATCH` gagne
      `type: z.string().min(1).optional()` — même contrainte que `Event.type`
      (`src/app/api/events/route.ts`), qui n'est pas non plus restreint à `EVENT_TYPES` côté
      serveur ; la liste fermée reste une contrainte d'interface (le `Select`), pas de zone
      grise entre deux modèles.
      *(fichier : `src/app/api/audio/services/[id]/route.ts`)*
- [x] **T007** — Même fichier, `GET` : la réponse inclut `type` et, seulement si
      `status === "PUBLISHED"`, `shareUrl` construit via `getOrCreatePrimaryShareToken` +
      `buildPublicAudioUrl` (T005).
      *(fichier : `src/app/api/audio/services/[id]/route.ts`)*
- [x] **T008** — `src/app/api/audio/services/route.ts` (création, `POST`) : le schéma Zod
      d'entrée gagne `type: z.string().min(1).optional()`, transmis à `createAudioService`.
      *(fichier : `src/app/api/audio/services/route.ts`)*
- [x] **T009** — Même fichier, `GET` (liste consommée par `AudioQueueClient`) : chaque ligne
      inclut `type`.
      *(fichier : `src/app/api/audio/services/route.ts`)*

### 4. UI

- [x] **T010** [P] — Libellé `"Audio"` → `"Audio évènements"` dans la section Opérations. Le
      libellé est poussé depuis `src/app/(auth)/layout.tsx` (pas dans `Sidebar.tsx`, qui ne fait
      que rendre `link.label`) — corrigé au bon endroit.
      *(fichier : `src/app/(auth)/layout.tsx`)*
- [x] **T011** [P] — `src/app/(auth)/audio/AudioQueueClient.tsx` : vocabulaire « culte » →
      « enregistrement » (en-tête de colonne, message vide, libellé du bouton de création),
      nouvelle colonne **Type** utilisant `getEventTypeLabel`/`getEventTypeBadge` de
      `@/lib/event-types`.
      *(fichier : `src/app/(auth)/audio/AudioQueueClient.tsx`)*
- [x] **T012** — Même fichier, `NewServiceModal` : nouveau `Select` **Type de rassemblement**
      (`EVENT_TYPE_OPTIONS`), désactivé et pré-rempli en lecture seule dès qu'un événement du
      jour est sélectionné.
      *(fichier : `src/app/(auth)/audio/AudioQueueClient.tsx`)*
- [x] **T013** [P] — `src/app/(auth)/audio/[id]/ServiceInfoEditor.tsx` : ajout du `Select`
      **Type de rassemblement**, même comportement de dérivation/lecture-seule que T012.
      *(fichier : `src/app/(auth)/audio/[id]/ServiceInfoEditor.tsx`)*
- [x] **T014** — `src/app/(auth)/audio/[id]/page.tsx` : transmettre `type` et `shareUrl` (via
      le `GET` étendu en T007, ou directement depuis Prisma + `getOrCreatePrimaryShareToken`
      côté Server Component) aux composants client.
      *(fichier : `src/app/(auth)/audio/[id]/page.tsx`)*
- [x] **T015** — `src/app/(auth)/audio/[id]/AudioServiceClient.tsx` : ajouter un lien retour
      `← File d'attente` vers `/audio` en tête d'écran.
      *(fichier : `src/app/(auth)/audio/[id]/AudioServiceClient.tsx`)*
- [x] **T016** — Même fichier : nouveau bloc **Lien d'écoute**, visible seulement si
      `status === "PUBLISHED"` — URL en lecture seule, bouton « Copier le lien »
      (`navigator.clipboard.writeText`), lien « Ouvrir ↗ » (`target="_blank"`). Message
      contextuel à côté du bouton Dépublier : « Le lien ci-dessus cessera de fonctionner. »
      *(fichier : `src/app/(auth)/audio/[id]/AudioServiceClient.tsx`)*
- [x] **T017** — Même fichier : regrouper visuellement Dépublier et Supprimer dans une zone
      distincte des actions courantes (déposer/nommer/publier), avec le style déjà utilisé pour
      les actions destructrices dans le reste du repo.
      *(fichier : `src/app/(auth)/audio/[id]/AudioServiceClient.tsx`)*
- [x] **T018** — `src/app/(auth)/admin/events/[eventId]/page.tsx` : ajouter la requête
      `prisma.audioService.findUnique({ where: { planningEventId: eventId } })` (aucun contrôle
      d'accès supplémentaire — voir `plan.md` § Décisions) et un bloc d'affichage :
      - `PUBLISHED` → lien vers l'écoute publique (`getOrCreatePrimaryShareToken` +
        `buildPublicAudioUrl`) ;
      - en préparation → lien interne `/audio/[id]` avec avancement (séquences rendues /
        total, même calcul que `AudioServiceClient`) ;
      - aucun enregistrement rattaché → rien affiché.
      *(fichier : `src/app/(auth)/admin/events/[eventId]/page.tsx`, et
      `src/app/(auth)/admin/events/[eventId]/EventDetailClient.tsx` si l'affichage doit être
      interactif)*

### 5. Tests (Vitest)

- [x] **T019** [P] — `src/modules/audio/services/__tests__/service.test.ts` : création avec
      `planningEventId` dérive `type` depuis l'événement (écrase une valeur saisie) ; création
      sans `planningEventId` conserve la valeur saisie ou retombe sur `"AUTRE"` ; mise à jour du
      rattachement re-dérive `type`.
      *(fichier : `src/modules/audio/services/__tests__/service.test.ts`)*
- [x] **T020** [P] — Nouveau test sur `src/app/api/audio/services/[id]/route.ts` (`GET`) :
      `shareUrl` est `undefined`/absent tant que `status !== "PUBLISHED"`, présent et correct une
      fois publié.
      *(fichier : `src/app/api/audio/services/[id]/__tests__/route.test.ts` ou fichier de test
      existant à étendre)*
- [x] **T021** [P] — Nouveau test sur `src/modules/audio/services/tokens.ts` :
      `buildPublicAudioUrl` produit le chemin attendu.
      *(fichier : `src/modules/audio/services/__tests__/tokens.test.ts`)*
- [x] **T022** — Nouveau test sur la fiche d'événement (`admin/events/[eventId]/page.tsx` ou
      helper extrait) : le bloc audio est absent sans enregistrement rattaché, affiche
      l'avancement pour un enregistrement en préparation, affiche le lien pour un enregistrement
      publié.
      *(fichier : à créer, ex. `src/app/(auth)/admin/events/[eventId]/__tests__/audio-block.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Vérification manuelle sur mobile : entrée de navigation, file d'attente, actions d'un
      culte utilisables sans zoom ni défilement horizontal (hors capacité Vitest — voir
      `plan.md` § Stratégie de tests). Vérifiée le 2026-08-27 via Chrome headless (viewport
      390×844) sur la file d'attente, la fiche d'enregistrement (lecture et édition), la fiche
      événement, la feuille de service STAR et le lecteur public : aucun débordement horizontal
      (`scrollWidth`/`clientWidth` égaux sur les 6 écrans). A également fait remonter deux bugs
      corrigés dans la foulée : liens non conformes à la charte boutons, et lecteur public
      inutilisable sans session (`proxy.ts` bloquait `/api/audio/public/*`).
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (voir mapping ci-dessous)
- [x] PR ouverte vers `feat/audio-cultes-publication` — déjà couverte par la PR #469
      (`feat/audio-cultes-publication` → `main`) ouverte avant cette feature ; ce travail met à
      jour cette même PR, aucune PR séparée nécessaire.

## Couverture des critères d'acceptation

| Critère (`spec.md`) | Couvert par |
|---|---|
| Membre de captation sans rôle voit « Audio évènements » et atteint la file sans adresse | Déjà livré (`43e32e4`) — T010 pour le libellé |
| Super Admin / Admin / Secrétaire voient l'entrée | Déjà livré (`43e32e4`) |
| Ministre / FD / Reporter / STAR hors captation ne la voient pas | Déjà livré (`43e32e4`) |
| Admin atteint la configuration sans adresse | Déjà livré (`43e32e4`) |
| Retour explicite vers la file depuis un culte ouvert | T015 |
| Noms de séquences configurés = ceux proposés au nommage (sinon liste par défaut) | Déjà livré (spec 019 / `AudioSettingsClient`) |
| Fiche d'événement signale un culte rattaché (préparation avec avancement, ou publié) et permet de le rejoindre | T018 |
| STAR feuille de service : accès à l'écoute seulement si publié | Déjà livré (`star-view/route.ts`), inchangé |
| Entrée absente de la barre de navigation réduite mobile | Déjà livré (vérifié — `BottomNav.tsx` ne mentionne pas audio) |
| Utilisable sur téléphone sans zoom ni défilement horizontal | Vérification manuelle finale |
| Actions destructrices distinctes visuellement + confirmation | Confirmation déjà livrée (modales existantes) — T017 pour la distinction visuelle |
| Aucune régression spec 019 | `npm run test` + vérification manuelle des parcours dépôt/nommage/publication/lien public |
| Enregistrement sans événement se retrouve/s'ouvre comme les autres | Déjà livré (spec 019 — dépôt sans rattachement déjà supporté) |
| Vocabulaire couvre tout type de rassemblement ; entrée nommée « Audio évènements » | T010, T011, T012, T013 |
| Type saisi sans rattachement ; dérivé de l'événement avec rattachement | T003, T004, T012, T013 |
| Type visible dans la file d'attente | T011 |
| Après publication, lien affiché et copiable, reste consultable | T007, T014, T016 |
| Lien obtenu de la même façon avec ou sans événement rattaché | T016 (le bloc ne dépend pas de `planningEventId`) |
| Dépublier signale que les liens diffusés cessent de fonctionner | T017 (message contextuel déjà prévu en T016) |
