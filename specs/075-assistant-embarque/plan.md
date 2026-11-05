# Plan technique — Assistant de prise en main

- **Spec associée** : `./spec.md`
- **Statut** : Implémenté
- **Mis à jour le** : 2026-11-05

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `assistant`, qui n'importe aucun autre module. Les
      questions de données sont **fournies par chaque module** (export de son index) et
      **composées dans `src/app`** — `assistant` ne lit jamais les tables d'un autre module
- [x] **Sécurité** : `/ask` et `/feedback` derrière `requireAuth` + église courante (chaque
      question de données revérifie la permission ou le périmètre de son écran) ; administration
      derrière `requireSuperAdmin()` ; coupure par église derrière
      `requireChurchPermission("church:settings", churchId)`
- [x] **Permissions** via `rolePermissions` : aucune permission nouvelle (Super Admin et
      `church:settings` existants) ; chaque fiche déclare la permission ou le prédicat de son écran
- [x] **Validation** Zod sur toutes les mutations (`@/modules/assistant/schemas`, `contract.ts`)
- [x] **Migration** Prisma `add_assistant` (pas de `db push`)
- [x] **Enums** depuis `@/generated/prisma/enums`
- [x] **UI** : `BottomSheet`, `Modal`, `IconButton`, `Button`, `Input`, `Textarea`, `Tabs`,
      `DataTable`, `StatusChip`, `EmptyState`, `Alert`, `useToast` réutilisés ; un seul composant
      nouveau, le panneau `AssistantPanel`

## Approche générale

Un **module `assistant`**, désactivable (`ENABLED_MODULES`), en trois briques :

1. **La base de connaissances** — les fiches **fournies avec Koinonia** vivent dans le code du
   module (fichiers TypeScript typés, versionnés avec l'application, issus de
   `base-connaissances.md` après relecture). La base de données ne garde que **ce que le Super
   Admin ajoute ou corrige** (fiches propres, surcharges d'une fiche fournie, formulations
   rattachées). La base lue = fournie ⊕ surcharges ⊕ ajouts, fusionnée à la lecture : une mise
   à jour de Koinonia n'efface jamais un ajout ni une correction.
2. **Le moteur de réponse** (`AnswerEngine`), interchangeable :
   - V1 `LocalEngine` = **recherche hybride** : un score **de sens** (petit modèle d'embeddings
     exécuté dans le processus Node) et un score **lexical** (mots normalisés, synonymes,
     tolérance aux fautes), combinés puis seuillés en *réponse*, *suggestions* ou *inconnue* ;
   - plus tard, un moteur IA (externe ou local) derrière la même interface, voir ADR-0028.
3. **Les questions de données** — chaque module fournit les siennes, comme des fonctions
   typées (paramètres Zod, description, garde de rôle, résultat borné) qui **réutilisent ses
   services et ses règles de périmètre**. Elles sont exactement les « outils » qu'une IA
   appellerait plus tard.

Aucune conversation n'est stockée : le fil vit dans l'état du panneau côté client. Le serveur ne
garde que des compteurs journaliers, les avis, et le texte **anonymisé** des questions sans
réponse ou jugées « Pas utile », regroupées.

## Recherche par le sens (V1)

- **Modèle** : `Xenova/multilingual-e5-small` (ONNX quantifié int8, ~120 Mo, 384 dimensions,
  bon en français), exécuté par `@huggingface/transformers` (transformers.js) sur
  `onnxruntime-node`. Variable `ASSISTANT_MODEL_DIR` (défaut `./models`), `env.allowRemoteModels
  = false` : **aucun appel réseau à l'exécution**.
- **Packaging** : le modèle est **téléchargé par la CI au build** (étape ajoutée à `ci.yml`
  pour l'artefact de release et à `deploy-staging.yml`) puis **embarqué dans l'artefact**. Next.js
  `output: "standalone"` : `serverExternalPackages: ["@huggingface/transformers",
  "onnxruntime-node"]` et vérification que le binaire natif et `models/` sont copiés dans
  l'artefact (`Package artifact`). Taille de l'artefact : environ +150 Mo.
- **Index** : chaque texte de fiche (question principale + formulations + titres) est encodé
  (`passage: …`, convention e5) ; vecteur normalisé, `Float32Array`. Cache persistant
  `assistant_embeddings` (empreinte SHA-256 du texte + nom du modèle → vecteur) pour ne pas tout
  recalculer au redémarrage ; calcul paresseux à la première question, puis réchauffage en tâche
  de fond déclenché par la première requête du processus.
- **Requête** : `query: <question>` encodée (20–50 ms CPU), similarité cosinus contre l'index en
  mémoire (quelques centaines de vecteurs : balayage linéaire, pas de base vectorielle).
- **Score** : `0,65 × sens + 0,35 × lexical`, filtré par rôle et module **avant** classement.
  Seuils (constantes, calibrées par le jeu d'évaluation) : ≥ `ANSWER` → réponse ; entre
  `SUGGEST` et `ANSWER` → 2–3 suggestions ; dessous → inconnue (remontée).
- **Repli** : modèle absent, illisible ou en erreur → moteur **lexical seul**, journalisé une
  fois ; l'assistant ne tombe jamais en panne à cause du modèle.
- **Mémoire** : ~250 Mo de plus dans le processus Next. Compatible avec un serveur de 4–8 Go.

## Modèle de données

```prisma
/// Réglage d'instance (une ligne, id = "instance") : activé par le Super Admin.
model AssistantSettings {
  id        String   @id
  enabled   Boolean  @default(false)
  updatedById String?
  updatedAt DateTime @updatedAt
  @@map("assistant_settings")
}

/// Coupure par église (Admin d'église) ; absence de ligne = suit l'instance.
model AssistantChurchSetting {
  churchId  String   @id
  disabled  Boolean  @default(true)
  updatedById String?
  updatedAt DateTime @updatedAt
  church    Church   @relation(fields: [churchId], references: [id], onDelete: Cascade)
  @@map("assistant_church_settings")
}

enum AssistantEntrySource { CUSTOM OVERRIDE }

/// Ajout du Super Admin (CUSTOM) ou correction d'une fiche fournie (OVERRIDE, builtinKey).
model AssistantEntry {
  id          String               @id @default(cuid())
  source      AssistantEntrySource
  builtinKey  String?              @unique @db.VarChar(40)   // « KB-021 » pour une surcharge
  title       String               @db.VarChar(200)
  questions   Json                 // string[] : formulations
  answer      String               @db.Text                 // étapes (texte simple, liens internes)
  href        String?              @db.VarChar(200)
  hrefLabel   String?              @db.VarChar(80)
  roles       Json                 // Role[] ; [] = tous
  module      String?              @db.VarChar(40)         // masquée si le module est désactivé
  screens     Json                 // préfixes d'écran pour les questions fréquentes
  disabled    Boolean              @default(false)          // masquer une fiche fournie
  updatedById String?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  @@map("assistant_entries")
}

enum AssistantPendingStatus { OPEN ANSWERED LINKED OFF_TOPIC }
enum AssistantPendingReason { UNANSWERED NOT_HELPFUL }

/// Question à traiter : texte anonymisé, sans compte ni église ; regroupée par proximité.
model AssistantPendingQuestion {
  id          String                 @id @default(cuid())
  text        String                 @db.VarChar(300)
  reason      AssistantPendingReason
  screen      String?                @db.VarChar(120)
  role        String?                @db.VarChar(40)   // rôle principal, pour le contexte
  count       Int                    @default(1)
  status      AssistantPendingStatus @default(OPEN)
  entryKey    String?                @db.VarChar(60)   // fiche fournie ou ajoutée qui y répond
  firstAt     DateTime               @default(now())
  lastAt      DateTime               @default(now())
  resolvedAt  DateTime?
  resolvedById String?
  @@index([status, lastAt])
  @@map("assistant_pending_questions")
}

/// Formulation rattachée à une fiche (« même question, autrement dite ») : enrichit l'index.
model AssistantAlias {
  id       String   @id @default(cuid())
  entryKey String   @db.VarChar(60)
  text     String   @db.VarChar(300)
  createdAt DateTime @default(now())
  @@index([entryKey])
  @@map("assistant_aliases")
}

/// Compteurs d'usage par jour (instance) : aucune donnée de personne.
model AssistantDailyStat {
  day        DateTime @id @db.Date
  questions  Int      @default(0)
  answered   Int      @default(0)
  suggested  Int      @default(0)
  unanswered Int      @default(0)
  dataAnswers Int     @default(0)
  helpful    Int      @default(0)
  notHelpful Int      @default(0)
  @@map("assistant_daily_stats")
}

/// Cache des vecteurs du modèle de sens.
model AssistantEmbedding {
  hash      String   @db.Char(64)
  model     String   @db.VarChar(80)
  vector    Bytes                      // Float32Array (384 × 4 octets)
  createdAt DateTime @default(now())
  @@id([hash, model])
  @@map("assistant_embeddings")
}
```

Migration `add_assistant`. Les questions à traiter et les statistiques sont **d'instance**
(la base l'est aussi) : elles ne portent ni compte ni église, ce qui rend l'anonymat structurel.

**Anonymisation du texte** (`anonymize()`) avant tout enregistrement : emails, numéros de
téléphone, IBAN, suites de 4 chiffres ou plus et URL remplacés par `[…]` ; texte tronqué à 300
caractères. Les prénoms ne sont pas détectables de façon fiable : l'écran d'administration le
rappelle et le Super Admin peut supprimer une question.

## Fiches fournies (`src/modules/assistant/knowledge/`)

```ts
interface KnowledgeEntry {
  key: string;                 // « KB-021 », « D02 »
  kind: "howto" | "data" | "fixed";
  title: string;
  questions: string[];         // formulation principale + variantes
  answer: string;              // texte ; les éléments d'interface entre « »
  href?: string; hrefLabel?: string;
  audience: Audience;          // { roles?: Role[]; permission?: string; predicate?: "linkedStar" | "shuttleTeam" | … }
  otherwise?: string;          // réponse aux autres rôles (qui peut, sans donnée)
  module?: string;             // masquée si le module est inactif
  screens?: string[];          // questions fréquentes de ces écrans
  dataQuestion?: string;       // kind "data" : clé du fournisseur (ex. "planning.myServicesMonth")
}
```

- Un fichier par domaine (`prise-en-main.ts`, `planning.ts`, `comptabilite.ts`…), repris de
  `base-connaissances.md` **après votre relecture**. La spec de relecture reste la source du
  texte ; le fichier `.md` est ensuite archivé.
- **Synonymes** (`synonyms.ts`) : « dispo » → disponible, « indispo », « pas là », « absent »,
  « quête » → collecte, « compta » → comptabilité…, utilisés par le score lexical.
- **Audience** : résolue côté serveur avec `rolePermissions` et les prédicats existants
  (`getShuttleAccess`, lien fiche STAR, `isTicketingVisible`…), fournis par la couche
  `src/app` (composition) — jamais un rôle déduit du client.

## Questions de données

Contrat dans `src/core/assistant.ts` (pur ; seul `import type { ZodType } from "zod"`) :

```ts
interface AssistantDataQuestion<P = unknown> {
  key: string;                               // « planning.myNextService »
  description: string;                       // pour une future IA
  params: ZodType<P>;                        // ex. { month?: "AAAA-MM" }
  run(ctx: { session; churchId; params: P }): Promise<DataAnswer | Refusal>;
}
type DataAnswer = {
  title: string;
  items: { label: string; detail?: string; href?: string }[]; // 8 au plus, puis « voir la suite »
  total: number;
  href: string; hrefLabel: string;
  empty?: string;                             // « Vous n'avez pas de service ce mois-ci. »
};
type Refusal = { refused: true; allowedRoles: string[] };
```

- Chaque module exporte ses questions depuis son **index** (`assistantDataQuestions`), écrites
  **avec ses propres services et gardes** : la question « qui est en service dimanche »
  appelle le même calcul de périmètre que la grille (`getUserDepartmentScope`), etc.
- **Composition** : `src/app/api/assistant/_data-questions.ts` importe les index des modules
  **actifs** (`registry.has`) et construit le catalogue. Rien dans `assistant` n'importe un
  autre module.
- **Garde-fou données sensibles** : `DataAnswer` n'a que des libellés ; un test parcourt chaque
  fournisseur avec des données factices et échoue sur un email, un numéro de téléphone, un IBAN
  ou un champ du module `care`. Aucune question de données n'est fournie par `care`.
- Premier lot (catalogue D01–D23 de la base) : `planning` (D01–D07, D11–D14), `ticketing` (D08),
  `planning`/requêtes (D09), `rooms` (D10), événements et comptes rendus (D15, D17), secrétariat
  (D16), `accounting` (D18, D19, D23), `shuttle` (D20), `treasury` (D21, D22). Les paramètres
  simples (« dimanche », « ce mois-ci », « octobre ») sont extraits par le moteur
  (`extractParams`, dates relatives en heure de Paris via `paris-days.ts`).

## Services (`src/modules/assistant/services/`)

- **`knowledge.ts`** — `loadKnowledge()` : fiches fournies ⊕ surcharges ⊕ ajouts ⊕ alias ;
  `visibleEntries(viewer)` : filtre par audience, module actif, fiche désactivée.
- **`text.ts`** — normalisation (minuscules, accents, ponctuation), tokens, synonymes,
  trigrammes, distance d'édition bornée ; `anonymize()`.
- **`embedder.ts`** — interface `Embedder { embed(texts): Promise<Float32Array[]> }` ;
  `OnnxEmbedder` (transformers.js, chargement paresseux et unique) et `NullEmbedder` (repli) ;
  cache `assistant_embeddings`.
- **`engine.ts`** — interface `AnswerEngine { answer(input, viewer): Promise<AssistantAnswer> }`
  et `LocalEngine` (hybride, seuils, suggestions, hors-sujet via les fiches `fixed`).
  `AssistantAnswer` = `howto` (texte, lien, *otherwise*) | `data` (clé + paramètres) |
  `suggestions` | `unknown` | `refused`.
- **`ask.ts`** — orchestre : réglages (instance, église) → moteur → si `data`, exécution du
  fournisseur → compteurs → si inconnue, `recordPending()`. Mention de l'église courante quand
  la personne en a plusieurs.
- **`pending.ts`** — `recordPending(text, reason, screen, role)` : anonymise, encode, regroupe
  avec une question ouverte à ≥ 0,90 de similarité (sinon nouvelle ligne) ; `answerPending`
  (crée une fiche CUSTOM), `linkPending` (crée un alias vers une fiche), `markOffTopic`,
  `deletePending`.
- **`entries.ts`** — CRUD des fiches CUSTOM, surcharge/rétablissement d'une fiche fournie.
- **`settings.ts`** — `isAssistantEnabled(churchId)` (module actif ∧ instance activée ∧ église
  non coupée), réglages instance et église, avec `logAudit`.
- **`stats.ts`** — incréments atomiques (`upsert` + `increment`) et lecture par période.
- **`digest.ts`** — tâche cron hebdomadaire `assistant-digest` : si des questions sont ouvertes,
  notifie les Super Admins (domaine `assistant`, `visibleWith: ["church:manage"]`), lien vers
  `/admin/assistant`.

## API

Déclarée dans `routes.api` du manifeste (`/api/assistant`), un `contract.ts` par route,
`npm run openapi`.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/assistant/ask` | POST | connecté, église courante, assistant actif | `{ question (1–300), screen? }` | `AssistantAnswer` (+ données) |
| `/api/assistant/suggestions` | GET | idem | `?screen` | questions fréquentes de l'écran et du rôle |
| `/api/assistant/feedback` | POST | idem | `{ entryKey?, question, helpful }` | `{ ok }` |
| `/api/assistant/settings` | GET, PUT | Super Admin | `{ enabled }` | réglage d'instance |
| `/api/assistant/church/[churchId]` | GET, PUT | `church:settings` dans l'église | `{ disabled }` | réglage d'église |
| `/api/assistant/admin/stats` | GET | Super Admin | `?from&to` | compteurs |
| `/api/assistant/admin/pending` | GET | Super Admin | `?status` | questions regroupées |
| `/api/assistant/admin/pending/[id]` | PATCH, DELETE | Super Admin | `{ action: "answer" \| "link" \| "offtopic", … }` | question |
| `/api/assistant/admin/entries` | GET, POST | Super Admin | fiche | fiches (fournies + ajoutées) |
| `/api/assistant/admin/entries/[key]` | PATCH, DELETE | Super Admin | surcharge / fiche | fiche |

`/ask` et `/feedback` : débit limité (`requireRateLimit`, 30 questions par minute et par
compte). Assistant inactif pour l'église → 404 (comme une fonction absente).

## UI

- **Bouton d'aide** dans `TopBar` (desktop et mobile), icône `CircleHelp` (`IconButton`,
  `aria-label` « Aide »). Assistant inactif (instance, église ou module) : le même bouton ouvre
  le guide (`/guide`). Rien n'est ajouté à `BottomNav`, `MoreSheet` ni `NavPageList`.
- **`AssistantPanel`** (client) : panneau latéral à droite sur desktop, `BottomSheet` plein écran
  sur téléphone (se ferme sans masquer la barre du bas). Contenu : questions fréquentes de
  l'écran et du rôle (`/suggestions`, selon `usePathname`), fil question/réponse en mémoire du
  composant (vidé à la fermeture), champ libre, rendu des réponses : étapes, bouton « Ouvrir
  … » (lien interne), liste de données avec « Voir dans … », suggestions cliquables, « Utile /
  Pas utile » sous chaque réponse.
- **`/admin/assistant`** (Super Admin, déclaré dans le manifeste) avec onglets : *Usage*
  (compteurs, part « Utile »), *Questions à traiter* (regroupées, nombre, écran, rôle ;
  « Répondre », « Rattacher à… » avec recherche de fiche, « Hors sujet », « Supprimer »), *Base*
  (fiches fournies et ajoutées, filtres par domaine et rôle, corriger / rétablir / masquer,
  ajouter), *Réglages* (activer l'assistant).
- **Paramètres de l'église** (`/admin/churches/[churchId]`) : interrupteur « Assistant » pour
  l'Admin, visible si l'instance l'a activé.
- **Guide** : section « Assistant » ; **CLAUDE.md**, `docs/auth.md`, `docs/database.md`,
  `CHANGELOG`.

## Le personnage (Nia, Koï)

- **Visuels** : 7 images par personnage (repos, repos yeux fermés, bonjour, réfléchit, content,
  désolé, icône), PNG transparents fournis par le porteur, contrôlés (cadrage identique, rien ne
  touche les bords) puis convertis en **WebP 256 et 512 px** dans
  `public/assistant/<nia|koi>/<expression>.webp` (quelques dizaines de Ko chacune) ; l'icône aussi
  en 64 px pour le bouton.
- **Choix de la personne** : colonne `assistantPersona` (`NIA` par défaut, `KOI`) sur `User`
  (préférence de compte, suit la personne sur tous ses appareils), réglée dans « Mon profil »
  (`PUT /api/profile/assistant-persona`, Zod, `requireAuth`). Enum `AssistantPersona` dans la
  même migration `add_assistant`.
- **Composant `AssistantAvatar`** (client) : `persona`, `expression`, `size`. Deux images
  superposées (repos et yeux fermés) pour le **clignement** (opacité, toutes les 4 à 6 s, durée
  aléatoire bornée) ; **flottement** léger (`translateY`, 3 s) ; **changement d'expression** en
  fondu (150 ms). Animations en CSS, désactivées sous `prefers-reduced-motion: reduce` ;
  `alt` = nom du personnage et son expression.
- **États** pilotés par le panneau : `bonjour` à l'ouverture (1,5 s puis `repos`), `réfléchit`
  pendant l'appel à `/ask`, `content` après « Utile », `désolé` sur une réponse `unknown` ou
  `refused`.
- **Bulle d'accueil** : une fois par appareil (`localStorage`, clé `koinonia-assistant-greeted`,
  lecture dans un `try/catch`), près du bouton d'aide, retirée après 6 s ou au premier clic ;
  jamais quand l'assistant est inactif.
- Le nom affiché vient de la persona (`Nia` / `Koï`) : les textes de l'assistant sont écrits à
  la première personne sans genre grammatical marqué (« Je vous aide… »), pour convenir aux deux.

## Préparer une IA (sans l'activer)

Formalisé dans **[ADR-0028](../../docs/adr/0028-assistant-moteur-interchangeable.md)** :
- l'interface `AnswerEngine` et `AssistantAnswer` ne dépendent pas de la recherche locale ;
- les fiches sont des documents récupérables (l'index de sens sert de recherche pour une IA) ;
- les questions de données sont des fonctions décrites (nom, description, paramètres Zod) que
  l'IA pourra appeler, sans autre accès aux données ;
- un futur moteur IA s'active par le Super Admin, avec mention aux utilisateurs, plafond de
  coût, journalisation des appels sans contenu, et passe par la même filtration par rôle ;
- un futur fournisseur local (Ollama, llama.cpp) ou externe n'est qu'une implémentation
  d'`AnswerEngine`, choisie par configuration (`ASSISTANT_ENGINE=local|…`).

## Décisions & alternatives écartées

- **Choix** : fiches fournies dans le code, surcharges et ajouts en base, fusion à la lecture.
  *Pourquoi* : versionnées et testées avec l'application (liens, rôles), et jamais écrasées.
  *Écarté* : tout en base avec une synchronisation au démarrage (conflits entre mise à jour et
  correction, migration de contenu à chaque version).
- **Choix** : modèle d'embeddings dans le processus Node (transformers.js). *Écarté* : service à
  part (Ollama, conteneur Python) — un processus de plus à exploiter pour un besoin de 120 Mo ;
  base vectorielle — inutile pour quelques centaines de fiches.
- **Choix** : modèle embarqué dans l'artefact par la CI. *Écarté* : téléchargement au premier
  lancement (appel externe en production, échec hors ligne).
- **Choix** : questions de données fournies par chaque module et composées dans `src/app`.
  *Pourquoi* : chaque module garde ses règles de périmètre ; `assistant` reste sans dépendance.
  *Écarté* : requêtes Prisma directes dans `assistant` (duplication des règles d'accès, risque
  de montrer plus que l'écran).
- **Choix** : questions à traiter d'instance, sans compte ni église. *Pourquoi* : anonymat par
  construction ; la base est d'instance.
- **Choix** : aucune permission nouvelle (Super Admin, `church:settings`). *Écarté* :
  `assistant:manage` pour un Admin d'église — la base est commune à l'instance.

## Risques & points d'attention

- **Binaire natif dans l'artefact standalone** (`onnxruntime-node`) : à valider dès le premier
  déploiement en staging ; repli lexical en cas d'échec.
- **Taille de l'artefact** (+150 Mo) et mémoire (+250 Mo) : acceptables, à surveiller.
- **Calibrage des seuils** : jeu d'évaluation (`knowledge/eval.ts` : questions de test →
  fiche attendue, dont formulations sans mot commun) ; script `npm run assistant:eval` avec le
  vrai modèle, hors CI, cible ≥ 85 % de bonnes réponses en tête.
- **Anonymisation imparfaite** (prénoms) : rappel à l'écran, suppression possible.
- **Fuite par les questions de données** : tests de périmètre par fournisseur (même résultat que
  l'écran pour un RD, refus pour un STAR) et test « aucun email / téléphone / IBAN ».
- **Démarrage** : premier encodage de l'index (~1 500 textes) en tâche de fond, cache en base
  ensuite.

## Stratégie de tests

Vitest, Prisma mocké, `NullEmbedder` ou faux embedder déterministe :
- **knowledge** : chaque `href` correspond à une page existante (`page.tsx`) ; chaque fiche
  déclare une audience cohérente avec la permission de son écran ; une fiche d'un module inactif
  disparaît ; surcharges et masquage appliqués.
- **text** : normalisation, synonymes, tolérance aux fautes, `anonymize()` (email, téléphone,
  IBAN, URL).
- **engine** : seuils réponse / suggestions / inconnue ; filtrage par rôle avant classement (un
  STAR ne reçoit jamais une fiche réservée) ; hors sujet ; repli lexical si l'embedder échoue.
- **ask** : assistant coupé (instance, église, module) → 404 ; question inconnue enregistrée
  anonymisée et regroupée ; compteurs ; mention de l'église courante.
- **data questions** : par fournisseur, périmètre identique à l'écran ; refus sans donnée ; liste
  bornée et message « rien à montrer » ; aucun champ sensible.
- **pending / entries / settings** : répondre, rattacher, hors sujet ; réglages d'instance et
  d'église (droits) ; audit.
- **routes** : accès (Super Admin, `church:settings`), Zod, débit limité.
- **UI** : snapshots de `TopBar` (bouton présent, lien guide quand inactif), navigation inchangée ;
  `AssistantAvatar` (persona par défaut Nia, image de l'expression demandée, aucune animation
  sous `prefers-reduced-motion`) ; préférence de persona (route, défaut, validation).
- `permissions.test.ts` (aucune nouvelle permission, liste des modules), `route-exhaustiveness`,
  `openapi.test.ts`.

## Écarts à l'implémentation

- **Questions de données dans `src/app`** : « Mon planning » et « Mes demandes » chargent leurs
  données dans `src/app` (`loadMyPlanning`, `loadMyRequests`), pas dans le module `planning`. Pour
  garder exactement le périmètre de l'écran, les fournisseurs vivent dans
  `src/app/api/assistant/_data/` et réutilisent ces chargeurs et les index des modules, au lieu
  d'un `assistant.ts` par module. Le contrat reste `src/core/assistant.ts`.
- **Consignes (KB-046, D06)** : elles ne s'affichent pas dans « Mon planning » mais seulement dans
  la vue Planning des responsables ; la fiche et la question de données sont réservées à
  `planning:department`, et leur texte libre est anonymisé avant d'être recopié.
- **Préférence de personnage** : `PUT /api/assistant/persona` (dans le module, absente s'il est
  désactivé) plutôt que `/api/profile/assistant-persona`.
- **Regroupement des questions** : similarité lexicale ≥ 0,90 ou texte identique, sans le modèle de
  sens (pas d'encodage de toutes les questions ouvertes à chaque remontée).
- **Binaires onnxruntime** : `.npmrc` (`onnxruntime-node-install=skip`) n'installe pas les pilotes
  CUDA ; l'empaquetage ne garde que les binaires Linux. Le build standalone ne trace pas
  `onnxruntime-node` : il est résolu depuis le `node_modules` complet livré à la racine de la
  release (vérifié en chargeant transformers depuis `.next/standalone`).
- **Seuils** : calibrés sur la recherche par mots (36/36 sur le jeu d'évaluation hors formulations
  « par le sens ») ; ceux du score hybride restent à confirmer avec `npm run assistant:eval` et le
  vrai modèle, que cette session ne pouvait pas télécharger.
