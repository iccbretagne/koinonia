# Tâches — Assistant de prise en main

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **Base** : `./base-connaissances.md`
- **Statut** : En cours

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Un commit par lot.

## Prérequis

- [x] Branche : `claude/visual-deposit-validation-process-gbyji8` (branche de session, à jour de
  `main`)
- [ ] Base de connaissances relue par le porteur (`base-connaissances.md`) — bloque **T15** à
  **T17**, pas le reste
- [x] Images de Nia et Koï fournies (15 PNG transparents, contrôlés) — fait

## Lot 1 — Socle : données, module, réglages

### 1. Données & migration

- [x] **T1** — Enums `AssistantEntrySource`, `AssistantPendingStatus`, `AssistantPendingReason`,
  `AssistantPersona` ; modèles `AssistantSettings`, `AssistantChurchSetting`, `AssistantEntry`,
  `AssistantPendingQuestion`, `AssistantAlias`, `AssistantDailyStat`, `AssistantEmbedding` ;
  colonne `User.assistantPersona` (`NIA` par défaut) ; relation inverse sur `Church`
  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration `add_assistant` (`prisma migrate diff`) puis `prisma generate`
  *(fichier : `prisma/migrations/<horodatage>_add_assistant/migration.sql`)*
- [x] **T3** [P] — Mocks Prisma des nouveaux modèles *(fichier : `src/__mocks__/prisma.ts`)*

### 2. Module et contrats

- [x] **T4** — Manifeste `assistant` (`dependsOn` core ; `routes` authenticated
  `/admin/assistant`, api `/api/assistant`, `/api/profile/assistant-persona` ; domaine de
  notification `assistant` avec `visibleWith: ["church:manage"]` ; aucune permission), index du
  module, ajout à `allManifests` *(fichiers : `src/modules/assistant/manifest.ts`,
  `src/modules/assistant/index.ts`, `src/lib/manifests.ts`)*
- [x] **T5** [P] — Règle dependency-cruiser `no-assistant-imports-other-modules` (aucun module
  autorisé) *(fichier : `.dependency-cruiser.cjs`)*
- [x] **T6** [P] — Contrat pur des questions de données : `AssistantDataQuestion`, `DataAnswer`
  (8 éléments au plus, libellés seulement), `Refusal`, `AssistantViewer`
  *(fichier : `src/core/assistant.ts`)*
- [x] **T7** [P] — Schémas Zod purs : question (1–300), avis, réglage d'instance, réglage
  d'église, fiche (CUSTOM / OVERRIDE), action sur question à traiter, persona
  *(fichier : `src/modules/assistant/schemas.ts`)*

### 3. Services de socle

- [x] **T8** — `settings.ts` : `isAssistantEnabled(churchId)` (module actif ∧ instance activée ∧
  église non coupée), lecture et écriture des réglages d'instance et d'église avec `logAudit`
  *(fichier : `src/modules/assistant/services/settings.ts`)*
- [x] **T9** [P] — `stats.ts` : incréments atomiques par jour (`upsert` + `increment`), lecture
  par période *(fichier : `src/modules/assistant/services/stats.ts`)*
- [x] **T10** [P] — `text.ts` : normalisation (minuscules, accents, ponctuation), tokens,
  trigrammes, distance d'édition bornée, `anonymize()` (email, téléphone, IBAN, 4 chiffres ou
  plus, URL → `[…]`, 300 caractères) *(fichier : `src/modules/assistant/services/text.ts`)*

### 4. Tests du lot 1

- [x] **T11** [P] — Tests `settings` (instance, église, module inactif, audit) et `stats`
  *(fichiers : `src/modules/assistant/services/__tests__/settings.test.ts`,
  `stats.test.ts`)*
- [x] **T12** [P] — Tests `text` : normalisation, fautes, `anonymize()` sur email, téléphone
  français et international, IBAN, URL *(fichier : `…/__tests__/text.test.ts`)*
- [x] **T13** — Matrice des permissions inchangée, liste des modules mise à jour ;
  `route-exhaustiveness` *(fichiers : `src/core/__tests__/permissions.test.ts`, tests existants)*

## Lot 2 — Base de connaissances et moteur

### 5. Fiches fournies

- [x] **T14** — Type `KnowledgeEntry` et `Audience` (rôles, permission, prédicat nommé),
  fichier des synonymes (« dispo », « indispo », « pas là », « quête » → collecte, « compta »…)
  *(fichiers : `src/modules/assistant/knowledge/types.ts`, `knowledge/synonyms.ts`)*
- [x] **T15** — Conversion des 60 fiches relues (KB-001 à KB-902) en fichiers par domaine :
  `prise-en-main.ts`, `planning.ts`, `demandes.ts`, `medias.ts`, `comptabilite.ts`,
  `billetterie.ts`, `administration.ts`, `fixed.ts` (hors sujet, refus poli)
  *(dossier : `src/modules/assistant/knowledge/`)*
- [x] **T16** — Fiches `data` D01 à D23 (formulations, audience, `otherwise`, clé du
  fournisseur) *(fichier : `src/modules/assistant/knowledge/donnees.ts`)*
- [x] **T17** [P] — Jeu d'évaluation : questions de test → fiche attendue, dont formulations sans
  mot commun (« je serai pas là dimanche » → déclarer une absence)
  *(fichier : `src/modules/assistant/knowledge/eval.ts`)*
- [x] **T18** — `knowledge.ts` : `loadKnowledge()` (fournies ⊕ surcharges ⊕ ajouts ⊕ alias),
  `visibleEntries(viewer)` (audience, module actif, fiche masquée)
  *(fichier : `src/modules/assistant/services/knowledge.ts`)*

### 6. Recherche par le sens

- [x] **T19** — Dépendance `@huggingface/transformers` ; `serverExternalPackages` pour
  `@huggingface/transformers` et `onnxruntime-node` *(fichiers : `package.json`,
  `next.config.ts`)*
- [x] **T20** — `embedder.ts` : interface `Embedder`, `OnnxEmbedder` (chargement paresseux et
  unique, `ASSISTANT_MODEL_DIR`, `allowRemoteModels = false`, préfixes `query:` / `passage:`,
  vecteurs normalisés), `NullEmbedder`, cache `assistant_embeddings` (SHA-256 + modèle)
  *(fichier : `src/modules/assistant/services/embedder.ts`)*
- [x] **T21** — `engine.ts` : interface `AnswerEngine`, type `AssistantAnswer`, `LocalEngine`
  (filtrage par audience **avant** classement, score `0,65 × sens + 0,35 × lexical`, seuils
  réponse / suggestions / inconnue, hors sujet, repli lexical journalisé une fois),
  `extractParams` (dimanche, ce mois-ci, nom de mois — heure de Paris)
  *(fichier : `src/modules/assistant/services/engine.ts`)*
- [x] **T22** [P] — Script d'évaluation hors CI avec le vrai modèle, cible ≥ 85 % en tête
  *(fichiers : `scripts/assistant-eval.ts`, `package.json` → `assistant:eval`)*
- [x] **T23** — Téléchargement du modèle `Xenova/multilingual-e5-small` (int8) au build et copie
  de `models/` et du binaire natif dans l'artefact *(fichiers : `.github/workflows/ci.yml`,
  `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy.yml` si concerné,
  `.gitignore`, `.env.example`)*

### 7. Tests du lot 2

- [x] **T24** [P] — Tests `knowledge` : chaque `href` correspond à un `page.tsx` existant ;
  audience cohérente avec la permission de l'écran ; module inactif → fiche absente ; surcharge,
  masquage, alias appliqués ; fiches `data` reliées à une clé de fournisseur du catalogue
  *(fichier : `…/__tests__/knowledge.test.ts`)*
- [x] **T25** [P] — Tests `engine` avec faux embedder déterministe : seuils, suggestions, hors
  sujet, un STAR ne reçoit jamais une fiche réservée (mais son `otherwise`), repli lexical si
  l'embedder échoue, `extractParams` *(fichier : `…/__tests__/engine.test.ts`)*
- [x] **T26** [P] — Tests `embedder` : cache relu, aucun accès réseau configuré, erreur de
  chargement → repli *(fichier : `…/__tests__/embedder.test.ts`)*

## Lot 3 — Questions de données

- [ ] **T27** — Fournisseurs `planning` (D01–D07, D09, D11–D14) écrits avec ses services et
  `getUserDepartmentScope` / `getUserMinistryScope`, exportés par l'index
  *(fichiers : `src/modules/planning/assistant.ts`, `src/modules/planning/index.ts`)*
- [ ] **T28** [P] — Fournisseurs `ticketing` (D08) et `rooms` (D10)
  *(fichiers : `src/modules/ticketing/assistant.ts`, `src/modules/rooms/assistant.ts`, index)*
- [ ] **T29** [P] — Fournisseurs événements, comptes rendus et secrétariat (D15–D17), dans le
  module qui porte ces écrans *(fichiers : `src/modules/<module>/assistant.ts`, index)*
- [ ] **T30** [P] — Fournisseurs `accounting` (D18, D19, D23), `shuttle` (D20), `treasury`
  (D21, D22) *(fichiers : `src/modules/{accounting,shuttle,treasury}/assistant.ts`, index)*
- [ ] **T31** — Composition du catalogue des modules actifs (`registry.has`) et des prédicats
  d'audience (fiche STAR liée, équipe navette, billetterie visible…)
  *(fichier : `src/app/api/assistant/_data-questions.ts`)*
- [ ] **T32** — Tests de périmètre par fournisseur : même résultat que l'écran (RD, Ministre,
  Admin), refus sans donnée pour un STAR, liste bornée à 8 + total, message « rien à montrer »,
  église courante uniquement *(fichiers : `src/modules/*/__tests__/assistant.test.ts`)*
- [ ] **T33** — Test garde-fou : chaque fournisseur, avec des données factices, ne renvoie ni
  email, ni téléphone, ni IBAN, ni champ du module `care` ; aucun fournisseur `care`
  *(fichier : `src/app/api/assistant/__tests__/data-questions.test.ts`)*

## Lot 4 — Orchestration et API

### 8. Services

- [ ] **T34** — `ask.ts` : réglages → moteur → fournisseur de données → compteurs → question
  inconnue enregistrée ; mention de l'église courante si la personne en a plusieurs
  *(fichier : `src/modules/assistant/services/ask.ts`)*
- [ ] **T35** — `pending.ts` : `recordPending` (anonymise, regroupe à ≥ 0,90 de similarité),
  `answerPending` (crée une fiche CUSTOM), `linkPending` (crée un alias), `markOffTopic`,
  `deletePending` *(fichier : `src/modules/assistant/services/pending.ts`)*
- [ ] **T36** [P] — `entries.ts` : CRUD des fiches CUSTOM, surcharge, rétablissement et masquage
  d'une fiche fournie ; invalidation de l'index en mémoire *(fichier :
  `src/modules/assistant/services/entries.ts`)*
- [ ] **T37** [P] — `digest.ts` : tâche cron hebdomadaire `assistant-digest` (notifie les Super
  Admins s'il reste des questions ouvertes, lien `/admin/assistant`), branchée au cron
  *(fichiers : `src/modules/assistant/services/digest.ts`, `src/app/api/cron/route.ts`)*

### 9. Route handlers (un `contract.ts` par route)

- [ ] **T38** — `POST /api/assistant/ask` (`requireAuth`, église courante, `requireRateLimit`
  30/min, 404 si inactif) *(dossier : `src/app/api/assistant/ask/`)*
- [ ] **T39** [P] — `GET /api/assistant/suggestions` (`?screen`, rôle) et
  `POST /api/assistant/feedback` (compteur ; « Pas utile » → question à traiter)
  *(dossiers : `src/app/api/assistant/suggestions/`, `feedback/`)*
- [ ] **T40** [P] — `GET/PUT /api/assistant/settings` (`requireSuperAdmin`) et
  `GET/PUT /api/assistant/church/[churchId]` (`requireChurchPermission("church:settings")`)
  *(dossiers : `src/app/api/assistant/settings/`, `church/[churchId]/`)*
- [ ] **T41** [P] — Administration Super Admin : `admin/stats`, `admin/pending`,
  `admin/pending/[id]` (PATCH, DELETE), `admin/entries`, `admin/entries/[key]`
  *(dossier : `src/app/api/assistant/admin/`)*
- [ ] **T42** [P] — `PUT /api/profile/assistant-persona` (`requireAuth`, Zod `NIA` | `KOI`)
  *(dossier : `src/app/api/profile/assistant-persona/`)*
- [ ] **T43** — `npm run openapi` et `docs/openapi.json` *(fichier : `docs/openapi.json`)*

### 10. Tests du lot 4

- [ ] **T44** [P] — Tests `ask` : coupé (instance, église, module) → 404 ; inconnue enregistrée
  anonymisée et regroupée ; compteurs ; église courante ; aucune conversation stockée
  *(fichier : `…/__tests__/ask.test.ts`)*
- [ ] **T45** [P] — Tests `pending` / `entries` : répondre, rattacher, hors sujet, supprimer ;
  la réponse sert dès la question suivante ; une fiche fournie mise à jour ne remplace pas une
  surcharge *(fichiers : `…/__tests__/pending.test.ts`, `entries.test.ts`)*
- [ ] **T46** [P] — Tests des routes : accès (Super Admin, `church:settings`, compte connecté),
  validation Zod, débit limité, persona *(fichiers : `src/app/api/assistant/**/__tests__/`)*

## Lot 5 — Interface

### 11. Personnage

- [ ] **T47** — Images WebP 256 et 512 px (et icône 64 px) des 7 expressions de Nia et de Koï
  *(dossier : `public/assistant/{nia,koi}/`)*
- [ ] **T48** — `AssistantAvatar` (client) : `persona`, `expression`, `size` ; clignement par
  superposition repos / yeux fermés (4 à 6 s), flottement, fondu d'expression, aucune animation
  sous `prefers-reduced-motion` ; `alt` = nom + expression
  *(fichier : `src/components/assistant/AssistantAvatar.tsx`)*

### 12. Panneau et bouton

- [ ] **T49** — `AssistantPanel` (client) : panneau latéral sur ordinateur, `BottomSheet` plein
  écran sur téléphone ; questions fréquentes de l'écran (`usePathname`), fil en mémoire vidé à la
  fermeture, rendu étapes / lien « Ouvrir … » / liste de données / suggestions / inconnue avec
  lien vers le guide, « Utile / Pas utile » ; expressions bonjour → réfléchit → content / désolé
  *(fichier : `src/components/assistant/AssistantPanel.tsx`)*
- [ ] **T50** — Bouton d'aide dans `TopBar` (ordinateur et téléphone) : icône du personnage si
  l'assistant est actif, sinon lien vers `/guide` ; bulle d'accueil une fois par appareil
  (`koinonia-assistant-greeted`, `try/catch`) ; état d'activation et persona passés par
  `(auth)/layout.tsx` → `AuthLayoutShell`. Rien dans `BottomNav`, `MoreSheet`, `NavPageList`
  *(fichiers : `src/components/TopBar.tsx`, `src/components/AuthLayoutShell.tsx`,
  `src/app/(auth)/layout.tsx`)*
- [ ] **T51** [P] — Choix Nia / Koï dans « Mon profil » *(fichiers :
  `src/app/(auth)/profile/page.tsx`, `ProfileClient.tsx`)*

### 13. Administration

- [ ] **T52** — `/admin/assistant` (`requireSuperAdmin`) avec onglets *Usage*, *Questions à
  traiter* (Répondre, Rattacher à…, Hors sujet, Supprimer, rappel sur les prénoms), *Base*
  (filtres domaine / rôle, corriger, rétablir, masquer, ajouter), *Réglages* (activer)
  *(dossier : `src/app/(auth)/admin/assistant/`)*
- [ ] **T53** [P] — Interrupteur « Assistant » dans les paramètres de l'église, visible si
  l'instance l'a activé *(fichier : `src/app/(auth)/admin/churches/[churchId]/…`)*

### 14. Tests du lot 5

- [ ] **T54** [P] — Tests `AssistantAvatar` : Nia par défaut, image de l'expression demandée,
  aucune animation sous `prefers-reduced-motion` *(fichier :
  `src/components/assistant/__tests__/AssistantAvatar.test.tsx`)*
- [ ] **T55** [P] — Tests `TopBar` / layout : bouton présent, lien guide quand inactif (instance,
  église, module), navigation inchangée ; instantanés mis à jour
  *(fichiers : tests existants de `TopBar` et du layout)*
- [ ] **T56** [P] — Tests `AssistantPanel` : fil vidé à la fermeture, avis envoyé, suggestions
  cliquables *(fichier : `src/components/assistant/__tests__/AssistantPanel.test.tsx`)*

## Lot 6 — Documentation

- [ ] **T57** [P] — Section « Assistant » du guide *(fichier : `src/app/(auth)/guide/page.tsx`)*
- [ ] **T58** [P] — `CLAUDE.md` (spécificités du module, structure), `docs/auth.md`,
  `docs/database.md`, `CHANGELOG.md`, `.env.example` (`ASSISTANT_MODEL_DIR`) ; statut de
  l'ADR-0028 à « Accepté » ; `base-connaissances.md` archivé
- [ ] **T59** — Statut de la spec à « Implémentée », cases du plan cochées

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run assistant:eval` (hors CI, avec le modèle) ≥ 85 %
- [ ] Déploiement staging : binaire `onnxruntime-node` et modèle chargés, sinon repli lexical
  constaté dans les journaux
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (correspondance ci-dessous)
- [ ] PR ouverte vers `main` (sur demande)

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Bouton d'aide sur tous les écrans connectés, ordinateur et téléphone | T50, T55 |
| Nia par défaut, Koï choisi dans « Mon profil » sur tous les appareils | T1, T42, T48, T51, T54 |
| Expressions selon la situation, immobile si animations réduites | T48, T49, T54 |
| Questions fréquentes de l'écran et du rôle | T39, T49 |
| Question libre avec fautes ou mots familiers → bonne réponse + lien | T10, T14, T21, T25 |
| Question de données → informations de la personne, église courante, lien | T27–T31, T34 |
| Jamais plus que l'écran correspondant | T27–T32 |
| Ni suivi pastoral ni coordonnées d'autrui | T33 |
| Lien toujours accessible au rôle | T18, T24 |
| STAR → qui peut le faire, sans donnée | T16, T21, T25, T32 |
| Aucun service externe | T20, T23, T26 |
| Question non reconnue → suggestions + guide, enregistrée anonymement | T21, T35, T44, T49 |
| Formulation sans mot commun → bonne réponse | T17, T20, T21, T22 |
| Super Admin traite les questions ; réponse servie aussitôt | T35, T41, T45, T52 |
| Base couvrant chaque rôle, liens vers des écrans existants et accessibles | T15, T16, T24 |
| Mise à jour de Koinonia sans perte des ajouts et corrections | T18, T36, T45 |
| Hors sujet → refus poli | T15 (`fixed.ts`), T25 |
| Module désactivé jamais mentionné | T18, T24, T31 |
| « Utile » / « Pas utile » | T39, T49, T56 |
| Aucune conversation conservée | T34, T44, T49, T56 |
| Super Admin : activation, usage, questions anonymes | T8, T40, T41, T52 |
| Admin d'église coupe l'assistant → lien vers le guide | T8, T40, T50, T53, T55 |
| Module désactivable, aucun bouton vers l'assistant | T4, T8, T50, T55 |
