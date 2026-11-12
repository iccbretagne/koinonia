# Plan technique — Connecter un assistant IA à Koinonia (serveur MCP)

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.
> Décision structurante : [ADR-0029](../../docs/adr/0029-serveur-autorisation-oauth-mcp.md)
> (Koinonia serveur d'autorisation OAuth pour MCP).

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `mcp` (manifeste, services OAuth/connexions) ; les
      outils sont composés dans `src/app/api/mcp/` à partir des **questions de données** de
      l'assistant (`src/app/api/assistant/_data/*`), seul endroit qui voit plusieurs modules,
      comme pour l'assistant. `mcp` n'importe aucun module métier
- [x] **Sécurité** : chaque appel MCP porte un jeton d'accès lié à **un compte et une église** ;
      la session est reconstruite depuis la base à chaque appel et chaque outil revérifie le droit
      de son écran (mêmes fournisseurs que l'assistant). Écrans d'administration :
      `requireSuperAdmin()` (instance) et `requireChurchPermission("church:settings", churchId)`
      (église)
- [x] **Permissions** via `rolePermissions` — aucune nouvelle permission
- [x] **Validation** Zod : enregistrement de client, autorisation, échange de jeton, paramètres
      d'outils, réglages
- [x] **Migration** Prisma : `mcp_clients`, `mcp_grants`, `mcp_tokens`, `mcp_settings`,
      `mcp_church_settings`, `mcp_calls`
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : `PageHeader`, `Button`, `ConfirmModal`, `EmptyState`, `Alert` réutilisés

## Approche générale

1. **Koinonia devient serveur d'autorisation OAuth 2.1** pour ses propres connexions MCP — le
   standard que les clients du marché savent utiliser (découverte, enregistrement dynamique,
   code d'autorisation + PKCE S256, jeton de rafraîchissement). La connexion de la personne
   reste la connexion Google existante (NextAuth) : l'écran d'autorisation est une page
   authentifiée de Koinonia.
2. **Serveur MCP sans état** sur `/api/mcp` (transport « Streamable HTTP », bibliothèque
   officielle `@modelcontextprotocol/sdk`, transport `WebStandardStreamableHTTPServerTransport`
   compatible avec les route handlers de Next.js). Chaque requête : jeton → (compte, église) →
   session reconstruite → outils filtrés.
3. **Les outils sont les questions de données de l'assistant** (spec 075, ADR-0028) : elles
   revérifient déjà le droit de l'écran, renvoient un refus sans donnée, ne contiennent aucune
   donnée `care` ni coordonnée d'autrui, et sont bornées. Une liste blanche décide lesquelles
   sont exposées (pas de trésorerie : la spec exclut les comptes de trésorerie). Quelques
   questions sont ajoutées pour couvrir la spec (audio publié, comptes rendus, guide).

## Modèle de données

```prisma
/// Client OAuth enregistré dynamiquement (RFC 7591) : un assistant IA (Claude, ChatGPT…).
model McpClient {
  id           String   @id @default(cuid())
  clientId     String   @unique @db.VarChar(64)
  name         String   @db.VarChar(200)        // client_name déclaré, affiché à l'autorisation
  redirectUris Json                              // liste exacte, https (ou http://localhost)
  createdAt    DateTime @default(now())
  grants       McpGrant[]
  @@map("mcp_clients")
}

/// Connexion d'un assistant : un compte, une église, un client. Révoquée = ligne gardée, revokedAt.
model McpGrant {
  id         String    @id @default(cuid())
  userId     String
  churchId   String
  clientId   String                              // McpClient.id
  scope      String    @db.VarChar(100)          // « read » (lot 1), « read write » (lot 2)
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?
  revokedById String?
  tokens     McpToken[]
  @@index([userId]) @@index([churchId]) @@index([clientId])
  @@map("mcp_grants")
}

/// Code d'autorisation, jeton d'accès ou de rafraîchissement — seule l'empreinte SHA-256 est stockée.
model McpToken {
  id            String       @id @default(cuid())
  grantId       String
  kind          McpTokenKind // CODE | ACCESS | REFRESH
  hash          String       @unique @db.Char(64)
  codeChallenge String?      @db.VarChar(128)    // PKCE S256 (code seulement)
  redirectUri   String?      @db.VarChar(500)    // code seulement
  expiresAt     DateTime
  usedAt        DateTime?                         // code et refresh : usage unique
  createdAt     DateTime     @default(now())
  @@index([grantId]) @@index([expiresAt])
  @@map("mcp_tokens")
}

enum McpTokenKind { CODE ACCESS REFRESH }

/// Interrupteur d'instance (Super Admin). Ligne unique.
model McpSettings { id String @id @default("singleton") enabled Boolean @default(false) updatedAt DateTime @updatedAt @@map("mcp_settings") }

/// Interrupteur par église (Admin d'église) — absent = coupé (spec : coupé par défaut).
model McpChurchSettings { churchId String @id enabled Boolean @default(false) updatedAt DateTime @updatedAt @@map("mcp_church_settings") }

/// Journal des appels d'outils, sans contenu (spec : compte, église, type de donnée, date).
model McpCall {
  id        String   @id @default(cuid())
  grantId   String
  userId    String
  churchId  String
  tool      String   @db.VarChar(100)
  outcome   String   @db.VarChar(20)   // answered | refused | error | limited
  createdAt DateTime @default(now())
  @@index([churchId, createdAt]) @@index([userId, createdAt])
  @@map("mcp_calls")
}
```

Durées : code 5 min, accès 1 h, rafraîchissement 90 jours **glissants** (renouvelé à chaque
usage, rotation : l'ancien est marqué utilisé ; réutilisation d'un refresh déjà utilisé ⇒
révocation de la connexion entière, détection de vol). « Inactivité 90 jours » = plus aucun
refresh valide. Purge des jetons expirés et des appels de plus de 12 mois par la tâche cron
(nouvelle tâche `mcp-maintenance`, quotidienne).

## Découverte et OAuth

| Adresse | Méthode | Rôle |
|---|---|---|
| `/.well-known/oauth-protected-resource` (et `/…/api/mcp`) | GET | Métadonnées de la ressource (RFC 9728) : `resource`, `authorization_servers` |
| `/.well-known/oauth-authorization-server` | GET | Métadonnées du serveur (RFC 8414) : endpoints, `S256`, `authorization_code`/`refresh_token`, `none` (client public) |
| `/api/mcp/oauth/register` | POST | Enregistrement dynamique (RFC 7591) : `client_name`, `redirect_uris` (https ou `http://localhost`/`127.0.0.1`) ; client **public**, sans secret ; débit limité par IP |
| `/mcp/autoriser` | page | Écran d'autorisation (authentifié, `(auth)`) : client, choix de l'église (parmi celles où la fonction est active et où le compte a un rôle), ce qui sera lu, « Autoriser » / « Refuser » |
| `/api/mcp/oauth/authorize` | POST | Depuis l'écran : crée le `McpGrant` et le code, redirige vers `redirect_uri` avec `code` et `state` ; refus ⇒ `error=access_denied` |
| `/api/mcp/oauth/token` | POST | `authorization_code` (PKCE vérifié, code à usage unique, `redirect_uri` identique) et `refresh_token` (rotation) |
| `/api/mcp/oauth/revoke` | POST | Révocation (RFC 7009) d'un jeton par le client |

`resource` (RFC 8707) est vérifié : seul `<origine>/api/mcp` est accepté. Les routes publiques
sont déclarées dans `routes.public` du manifeste `mcp` (les deux `.well-known` relèvent de
`NOYAU_ROUTES` si le préfixe n'appartient à aucun module). Une page `/mcp/autoriser` est
déclarée en `authenticated` ; un compte non connecté passe par la connexion puis revient.

## Serveur MCP (`/api/mcp`)

- `POST` (et `GET`/`DELETE` → 405, sans session de transport) : `Authorization: Bearer` requis,
  sinon `401` avec `WWW-Authenticate: Bearer resource_metadata="…"` (déclenche la connexion
  côté client).
- Contrôles à chaque requête : jeton ACCESS valide → connexion non révoquée → fonction active
  (instance et église) → compte toujours avec un rôle dans l'église → `lastUsedAt` mis à jour
  (au plus une fois par minute).
- Session reconstruite par une fonction extraite du callback `session` de NextAuth
  (`buildSessionUser(userId)`, `src/lib/auth.ts`, même code — pas de copie), puis
  `buildViewer(session, churchId)` de l'assistant.
- Débit : 60 appels par minute et par compte (`rateLimit`, clé `mcp:<userId>`), `429` explicite.
- Outils : `tools/list` ne présente que les outils dont l'audience correspond au viewer
  (mêmes prédicats/permissions que l'assistant) ; `tools/call` exécute la question, renvoie un
  texte structuré (titre, lignes, lien vers l'écran) et une version JSON (`structuredContent`).
  Refus ⇒ « Aucune donnée disponible pour ce compte. » (même réponse qu'une donnée absente).
  Chaque appel écrit un `McpCall`.
- Instructions du serveur : français, dates à Paris, ne jamais inventer une donnée absente.

### Outils du lot 1 (lecture)

Exposés depuis le catalogue de l'assistant (liste blanche `MCP_TOOLS`, nom MCP = clé avec `_`) :
`planning.myNextService`, `planning.myServicesMonth`, `planning.myUnavailabilities`,
`planning.myCollection`, `planning.myReplacements`, `planning.instructions`,
`planning.myTeamEvents`, `planning.myPendingRequests`, `planning.servingOnDay`,
`planning.unavailableOnDay`, `planning.toReplace`, `planning.teamUnavailabilities`,
`planning.eventsThisWeek`, `planning.secretariatPending`, `planning.missingReports`,
`accounting.myRequests`, `accounting.toValidate`, `accounting.awaitingPayment`,
`rooms.myReservations`, `ticketing.myAssignments`, `shuttle.balance`.

Exclus : `treasury.*` (comptes de trésorerie, exclus par la spec).

Ajoutés (dans `src/app/api/assistant/_data/`, donc aussi disponibles pour l'assistant) :
`audio.recentSermons` (cultes publiés :
titre, date, orateur — `audio:listen`), `reports.recent` (comptes rendus récents, `reports:view`),
`reports.get` (contenu d'un compte rendu, `reports:view` — ajouté après la recette),
et l'outil `guide_search` (fiches de l'assistant filtrées par audience, via le moteur existant).

### Outils du lot 2 (écriture, confirmation)

`declare_unavailability`, `answer_service`, `draft_request` : chacun en **deux appels** —
`…_preview` renvoie le résumé et un jeton de confirmation (5 min, à usage unique, lié au
compte, à l'église et aux paramètres) ; `…_confirm` exécute avec ce jeton. Les descriptions
d'outils demandent explicitement à l'assistant de montrer le résumé et d'attendre l'accord de la
personne. Exécution par les services existants (`@/modules/planning`, `@/modules/accounting`)
avec `logAudit` (`details.via = "mcp"`). Lot livré après validation du lot 1.

## Écrans

- **Mon profil → Assistants connectés** (`/profile/assistants`) : adresse du serveur à
  copier, mode d'emploi court (Claude, ChatGPT, Claude Code), liste des connexions (assistant,
  église, date, dernière utilisation) avec **Révoquer** (`ConfirmModal`).
- **Paramètres de l'église** (`/admin/churches/[churchId]`, `church:settings`) : carte
  « Assistants IA (MCP) » — interrupteur (coupé par défaut), liste des comptes connectés,
  révocation.
- **Administration de l'instance** (`/admin/mcp`, Super Admin) : interrupteur, compteurs
  (connexions actives, appels sur 30 jours, par église), sans contenu.

## API internes

| Endpoint | Méthode | Garde | Rôle |
|---|---|---|---|
| `/api/mcp/connections` | GET | `requireAuth` | Mes connexions |
| `/api/mcp/connections/[id]` | DELETE | `requireAuth` (propriétaire) ou `church:settings` de l'église de la connexion | Révoquer |
| `/api/mcp/church/[churchId]` | GET/PUT | `church:settings` | Interrupteur + liste de l'église |
| `/api/mcp/settings` | GET/PUT | `requireSuperAdmin` | Interrupteur d'instance + compteurs |

Chaque route a son `contract.ts` ; `npm run openapi`.

## Décisions & alternatives écartées

- **Choix** : OAuth 2.1 avec enregistrement dynamique, clients publics, PKCE S256 obligatoire.
  — *Pourquoi* : seul parcours que tous les clients MCP du marché implémentent, sans clé à
  copier (spec).
- **Écarté** : jeton personnel à coller. — *Raison* : refusé par la spec (tous les comptes,
  sans copier de clé), circule par message.
- **Écarté** : bibliothèque de serveur OAuth complète (`oidc-provider`) ou routeur OAuth de la
  bibliothèque MCP (Express). — *Raison* : surface bien plus large que nécessaire, intégration
  Express dans Next.js ; les cinq endpoints requis sont courts et testables, en s'appuyant sur
  des primitives éprouvées (`crypto.randomBytes`, SHA-256, comparaison à temps constant).
- **Choix** : jetons opaques, empreinte stockée. — *Pourquoi* : révocation immédiate (spec),
  pas de clé de signature à gérer ; une lecture en base par appel est acceptable.
- **Choix** : outils = questions de données de l'assistant. — *Pourquoi* : mêmes règles de
  périmètre que les écrans déjà revues et testées, aucune requête nouvelle sur les données
  sensibles, un seul endroit à faire évoluer.
- **Choix** : serveur sans état (`sessionIdGenerator: undefined`). — *Pourquoi* : pas de
  mémoire entre requêtes à tenir sur plusieurs instances de Next.js ; aucun outil ne pousse de
  notification.

## Risques & points d'attention

- **Sécurité OAuth** : redirection ouverte (URI exactes enregistrées), vol de code (PKCE),
  rejeu (usage unique, rotation, révocation en cascade), CSRF sur l'écran d'autorisation
  (formulaire POST avec jeton anti-CSRF de NextAuth / `SameSite`), clickjacking
  (`frame-ancestors 'none'` sur `/mcp/autoriser`). Revue de sécurité dédiée avant la PR.
- **Fuite par les outils** : toute nouvelle question passe par la revue « jamais care, jamais
  coordonnée d'autrui » ; test qui vérifie la liste blanche et l'absence de `treasury.*`.
- **Données envoyées à un tiers** : ce que lit l'assistant part chez son fournisseur d'IA ;
  l'écran d'autorisation le dit en une phrase.
- **Session reconstruite** : extraction de `buildSessionUser` sans changer le comportement de
  NextAuth (tests existants d'authentification).
- **Proxy et route `.well-known`** : vérifier que `src/proxy.ts` laisse passer ces chemins
  publics.

## Stratégie de tests

- OAuth : métadonnées ; enregistrement (URI refusées : http non local, fragment) ; autorisation
  (église sans fonction active, compte sans rôle, refus) ; échange (PKCE faux, code réutilisé,
  `redirect_uri` différent, code expiré) ; rafraîchissement (rotation, réutilisation ⇒
  révocation) ; révocation.
- Serveur : 401 + `WWW-Authenticate` ; connexion révoquée/expirée/fonction coupée/compte sans
  rôle ⇒ refus ; `tools/list` filtré par rôle (STAR, Resp. département, Secrétaire, Comptable) ;
  `tools/call` refus = même message qu'absence ; journalisation ; débit.
- Liste blanche : aucun outil `treasury.*`, aucun outil `care`.
- Écrans : révocation par le propriétaire et par l'Admin d'église (autre église : 404).
- Bout en bout : client MCP de la bibliothèque officielle contre le serveur local
  (découverte → enregistrement → autorisation via Playwright → appel d'outil).

## Écarts à l'implémentation (lot 1)

- **Adresse du serveur** : `/api/mcp/server` (et non `/api/mcp`) : `/api/mcp` reste le préfixe
  des routes internes à session (connexions, réglages) ; le serveur et les points d'entrée OAuth
  (`/api/mcp/oauth/*`) sont des préfixes publics, authentifiés dans le route handler.
- **Décision d'autorisation en `fetch`** : un formulaire classique est bloqué par la règle CSP
  `form-action` au moment de la redirection vers l'assistant ; l'écran envoie la décision en
  arrière-plan (même origine, en-tête `Origin` obligatoire) et navigue vers l'adresse renvoyée.
- **Retour après connexion** : la page de connexion accepte `?next=` seulement vers
  `/mcp/autoriser?…` ; l'autorisation sans session y renvoie.
- **Session reconstruite** : `buildSessionForUser` (nom final) partage `fillSessionUser` avec le
  callback NextAuth.
- **Écran d'autorisation** : affiche l'hôte de l'adresse de retour (un assistant malveillant ne
  peut pas se faire passer pour un autre par son seul nom) ; purge des assistants enregistrés
  sans connexion après 7 jours (`mcp-maintenance`).
- **Questions ajoutées** dans `src/app/api/assistant/_data/audio-reports.ts` :
  `audio.recentSermons`, `reports.recent` (événement, orateur, titre du message).

## Retours de recette (lot 1)

Constats faits en connectant Claude à la recette, vérifiés dans le code :

1. **`reports_recent` sans orateur ni titre** (« dim. 25 oct. · Culte » suivi d'un espace) : la
   requête lit bien `speaker` et `messageTitle` ; ils étaient vides en base. Le détail dit
   désormais « Orateur et titre du message non renseignés » (ou le champ manquant seul).
2. **Contenu d'un compte rendu** : nouvelle question `reports.get` (outil `reports_get`,
   `reports:view`, comme l'écran) — le compte rendu du jour `day`, sinon le plus récent :
   orateur, message, une ligne par département (statistiques via `src/lib/report-stats.ts`,
   extrait de l'export pour être utilisable sans jsPDF, et remarques), observations générales,
   décisions. Texte libre passé par `anonymize`. Seuls les événements `reportEnabled` comptent,
   comme l'écran.
3. **Listes tronquées à 8** : `boundedAnswer` coupait toutes les questions. Il ne coupe plus ; la
   bulle de l'assistant borne à 8 (`dataRunner`), le serveur MCP pagine (`limit` 50 par défaut,
   100 au plus, `offset`) et renvoie toujours `total` et `nextOffset`. La file du secrétariat
   donnait un « total » de demandes pour des lignes par type (faux « N de plus ») : le nombre de
   demandes passe dans le titre.
4. **Mise en forme** : « Culte  » venait du titre saisi avec un espace final, « CULTE » de
   l'énumération brute `Event.type`. `boundedAnswer` nettoie désormais chaque libellé et détail
   (espaces de bord et multiples) et retire un détail vide ; le type est affiché en clair
   (`getEventTypeLabel`), et omis quand le titre commence déjà par lui. « Culte du 13/09/2026 »
   est un titre saisi tel quel.
5. **Lecture seule** : les instructions du serveur l'énoncent explicitement, comme
   `readOnlyHint` sur chaque outil.

**Candidats à l'écriture** (lot 2, non implémentés, toujours en deux temps aperçu → confirmation) :
déclarer une indisponibilité (absence sur une période ou des événements), répondre à un service
(disponible / indisponible), créer une demande en brouillon. Pistes notées pour plus tard, hors
spec actuelle : signaler un retrait de service, saisir l'orateur et le titre d'un compte rendu.

## Écarts à l'implémentation (lot 2)

- **Portée `write` accordée par la personne** : case « actions confirmées » sur `/mcp/autoriser`,
  décochée par défaut. Un assistant peut demander `write` (déclaré dans `scopes_supported`), mais
  seule la case l'accorde ; reconnecter le même assistant met à jour la portée de la connexion.
  « Mon profil » et les paramètres de l'église affichent « lecture seule » ou « lecture et
  actions ».
- **Confirmation par jeton seul** : `…_confirm` ne reçoit que le jeton ; ce qui est exécuté est le
  résumé figé à l'aperçu (`mcp_confirmations.payload`). Un assistant ne peut donc pas confirmer
  d'autres paramètres que ceux montrés à la personne.
- **Périmètre** : la fiche STAR liée au compte (`listLinkedMemberIds`), jamais un tiers ; outils
  absents sans fiche liée (prédicat `linkedStar`). Absence = période, tous les départements
  (comme le formulaire par défaut, dates à minuit UTC) ; réponse = tous les événements de ses
  départements le jour donné, pour un mois proposé dans « Mes disponibilités ».
- **Brouillon de demande (T38) = lien prérempli** (décision du 2026-11-12) : aucune demande
  n'a d'état brouillon, et en ajouter un toucherait toutes les files de traitement. L'outil
  `draft_request` renvoie un lien vers `/requests/new` prérempli (`src/app/(auth)/requests/prefill.ts` :
  annonce, visuel, ajout d'événement ; texte et dates seulement, jamais d'identifiant). Rien n'est
  enregistré : pas de confirmation, outil en lecture, proposé à qui ouvre le formulaire
  (`members:view`), même sans la case des actions.

## Lot 3 — actions des responsables (plan)

### Principe : un seul code métier pour l'écran et l'assistant

Les routes concernées font aujourd'hui leurs contrôles et leur écriture dans le route handler,
avec `requireChurchPermission` (qui relit la session NextAuth). Le serveur MCP a déjà une
session reconstruite (`buildSessionForUser`). Pour ne pas dupliquer de règle, chaque écriture est
**extraite** du route handler dans un module voisin `_core.ts` (couche `src/app`, comme
`_shared.ts`) : une fonction `(session, churchId, entrée validée) → résultat` qui fait **tous**
les contrôles qui ne dépendent pas de la requête HTTP (périmètre de département, date limite,
appartenance à l'église, doublons, conflits) puis l'écriture, la journalisation et les
notifications. Les contrôles de permission passent par les variantes à session existantes
(`hasChurchPermission(session, …)`, `getUserDepartmentScope`, `requireDepartmentAccess`). Le route
handler garde l'authentification, le débit et l'analyse du corps, puis appelle le cœur ; son
comportement HTTP est inchangé (tests existants à l'identique).

| Action | Route d'origine | Cœur extrait |
|---|---|---|
| Créer des événements | `POST /api/events` (+ `POST /api/events/[id]/departments`) | `src/app/api/events/_core.ts` : `createEvents` |
| Remplir le planning | `PUT /api/events/[id]/departments/[deptId]/planning` | `…/planning/_core.ts` : `savePlanning` |
| Recopier un planning | `POST /api/events/[id]/duplicate-planning` | `…/duplicate-planning/_core.ts` : `duplicatePlanning` |
| Relancer les sans-réponse | `POST …/departments/[deptId]/availability` | service existant `manualRelance` (`@/modules/planning`) |
| Publier des consignes | `PUT /api/departments/[id]/notices` | `…/notices/_core.ts` : `saveNotice` |
| Réserver une salle | `POST /api/room-reservations` | service existant `createReservation` (`@/modules/rooms`) |
| Remplir le compte rendu | `PUT /api/events/[id]/report` | `…/report/_core.ts` : `saveReport` |
| Absence pour un STAR | `POST /api/absences` | `src/app/api/absences/_core.ts` : `declareAbsenceAs` |
| Répondre pour un STAR | `PUT /api/availability` | `src/app/api/availability/_core.ts` : `answerAs` |

### Outils MCP

Même mécanique qu'au lot 2 (`…_preview` / `…_confirm`, jeton `kmx_`, résumé figé dans
`mcp_confirmations.payload`, `logAudit` `via: "mcp"`), dans `src/app/api/mcp/_actions/` (un
fichier par domaine, catalogue commun). Chaque outil n'est proposé que si le compte peut faire
l'action dans l'application (même permission que la route ; périmètre vérifié à chaque appel).

Pour désigner sans ambiguïté, les aperçus prennent des **identifiants** (événement,
département, STAR, salle), fournis par des outils de lecture dédiés, sans coordonnée :

- `planning_eventsToStaff` : événements à venir de son périmètre, avec départements et état de
  la grille (identifiants) ;
- `planning_candidates(eventId, departmentId)` : STAR du département avec, pour chacun, l'état
  de la grille (disponible, si besoin, pas disponible, absent, sans réponse), désistement en
  attente, service dans un autre département ce jour-là, statut actuel, et **nombre de services
  des 60 derniers jours** — les données de la grille (`getPlanningAvailability`), rien de plus ;
- `rooms_available(day, start, end)` : salles autorisées et libres sur le créneau ;
- `reports_get` existant (contenu actuel d'un compte rendu, avant de le remplir).

### Détection des changements entre aperçu et confirmation

Le résumé figé contient une **empreinte de l'état lu** à l'aperçu (SHA-256 d'une sérialisation
triée) : grille du département pour l'événement (planning, recopie), consigne existante,
compte rendu existant, absences et réponses des STAR proposés. `…_confirm` recalcule
l'empreinte : différente ⇒ refus « Les données ont changé depuis l'aperçu », rien n'est fait.
Les conflits de salle et la date limite sont revérifiés par le cœur lui-même.

### Règles par action

- **Événements** : 1 à 12 occurrences par confirmation (date et heure explicites ou règle
  hebdomadaire / mensuelle bornée), départements en service ; aperçu = liste, doublons
  (même jour, même titre) signalés ; tout dans une transaction, rien si une date est invalide.
- **Remplir le planning** : l'assistant fournit `[{memberId, status}]` ; le cœur exige que chaque
  STAR appartienne au département (règle existante). L'aperçu signale, pour chaque STAR
  proposé, absent / pas disponible / déjà en service ailleurs, sans bloquer (la grille ne bloque
  pas non plus) ; il liste ce qui remplace la grille actuelle.
- **Recopie** : source et cible du même périmètre ; l'aperçu marque les STAR recopiés devenus
  absents ou pas disponibles pour la cible.
- **Relance** : une fois par jour et par événement (règle de `manualRelance`) ; aperçu = nombre
  de STAR relancés par département, jamais de nom.
- **Consignes** : texte ≤ 2 000 caractères, remplace la consigne existante (montrée dans l'aperçu).
- **Salle** : `rooms:reserve`, salle autorisée pour l'église, conflit = refus.
- **Compte rendu** : `reports:edit` (ou `events:manage`), comptes rendus activés pour
  l'événement ; sections par département reprises du compte rendu existant ou des départements en
  service ; l'aperçu montre chaque rubrique et ce qu'elle remplace.
- **Pour un STAR** : absence = `absences:manage` + STAR dans le périmètre ; réponse =
  `planning:edit` + départements du périmètre ; `enteredById` = le responsable (la grille le
  montre déjà comme saisi par un tiers).

### Instructions et écran

Instructions du serveur : liste des actions disponibles pour ce compte, rappel du deux-temps et
de l'accord explicite ; pour le planning, « Koinonia ne connaît ni les compétences ni l'effectif
nécessaire : demande-les au responsable et applique ses contraintes ». L'écran d'autorisation
liste les actions possibles selon le rôle (même case « actions confirmées »).

### Tests

Pour chaque cœur extrait : tests de route existants inchangés + test du cœur appelé avec une
session (périmètre, date limite). Pour chaque outil : aperçu sans écriture, confirmation
unique, refus hors périmètre, refus si l'empreinte a changé, journalisation `via: "mcp"`,
outil absent sans la permission. Série d'événements : 13 dates refusées, transaction annulée
si une date est invalide.

### Découpage proposé

Trois PR successives, chacune utilisable seule : **3a** planning (candidats, remplir,
recopier, relancer, consignes) ; **3b** pour un STAR (absence, réponse) et compte rendu ;
**3c** événements et salles.

## Écarts à l'implémentation (lot 3a)

- **Lectures de planning dans la couche des actions**, pas dans le catalogue de l'assistant :
  `planning_eventsToStaff` et `planning_candidates` renvoient des identifiants, inutiles à la
  bulle de l'assistant intégré ; elles sont proposées avec les actions (case cochée,
  `planning:edit`). Fichier `src/app/api/mcp/_actions/planning.ts` (et non
  `assistant/_data/planning-staff.ts`).
- **Cœurs extraits sans contrôle de permission** : la route garde `requireChurchPermission` et
  `requireDepartmentAccess` ; l'assistant les refait avec la session (`hasChurchPermission`,
  `requireDepartmentAccess`). Le cœur porte tout le reste (date limite, appartenance, débrief
  unique, journal, désistements, notifications). Paramètre `details` ajouté au journal
  (`via: "mcp"`) ; la route n'en passe pas, son journal est inchangé.
- **Recopie** : la route n'écrivait pas de journal ; l'assistant en écrit un (`via: "mcp"`).
- **Relance** : pas d'empreinte (la règle « une fois par jour » de `manualRelance` suffit).
- **Remplir le planning** : même sémantique que la grille — seuls les STAR listés changent,
  `null` retire un STAR ; les alertes (absent, pas disponible, en service ailleurs) sont
  signalées sans bloquer, comme dans la grille.

## Écarts à l'implémentation (lot 3b)

- **Permission injectée** dans le code partagé (`RequirePermission`) : les routes passent
  `requireChurchPermission(permission, churchId)`, l'assistant une variante qui lit la session
  reconstruite (`hasChurchPermission`, même résultat). Ainsi les routes et leurs tests restent
  identiques, et la règle « pour un tiers : permission + périmètre » n'existe qu'une fois.
- `assertBackupsAllowed` déménage de `absences/route.ts` vers `absences/_core.ts` (importé par
  `absences/[id]/route.ts`) : un route handler n'exporte plus de fonction métier.
- **Lecture `stars_inScope`** (nom → identifiant, départements) : nécessaire au Secrétariat, qui
  a `absences:manage` sans `planning:edit` et ne voit donc pas `planning_candidates`.
- **Compte rendu par jour** : `fill_report_preview` accepte `eventId` ou `day` ; plusieurs
  événements ce jour-là ⇒ refus listant les identifiants. Sections désignées par **nom de
  département** (accents et casse ignorés), clés de statistiques rappelées dans la description.

## Écarts à l'implémentation (lot 3c)

- **Dates explicites** plutôt qu'une règle de récurrence : l'assistant calcule les dates (« tous
  les dimanches de décembre ») et l'aperçu les liste une à une ; chaque date crée un événement
  simple par `createEvent` (pas de série « parent + enfants »), ce qui garde l'aperçu exact.
- **Vérifications avant écriture, pas une transaction unique** : toutes les dates (futures,
  distinctes), les départements et le droit sont vérifiés à l'aperçu puis à la confirmation
  avant la première création ; seule une erreur de base en cours de route peut laisser une partie
  créée, et le message le dit.
- **Rattachement des départements** : `addEventDepartment` extrait de
  `POST /api/events/[id]/departments` (`_core.ts`), avec `verifyDepartmentChurch` et
  `getSeriesEventIds` ; réservation : `reserveRoom` extrait de `POST /api/room-reservations`.
- **Heure de Paris** : `parisDateTime(jour, heure)` (changement d'heure compris), comme le
  formulaire qui envoie l'heure locale du navigateur.

## Écarts à l'implémentation (lot 3, tâches du département)

- **Ajout après la recette** : un responsable met des STAR en service par `fill_planning` puis
  veut leur attribuer les tâches du département (`Task` / `TaskAssignment`). Lecture
  `planning_tasks` et action `assign_tasks`, sur le modèle des autres actions du lot 3.
- **Service plutôt que `_core.ts`** : la logique ne dépend ni de la session ni d'un contrôle de
  permission, elle vit donc dans le module planning (`task-assignment.service.ts`), appelée par la
  route et par l'assistant ; les droits restent chez l'appelant.
- **Plusieurs tâches en une transaction** : `assignEventTasks` remplace les affectations des
  tâches citées en une seule `$transaction` ; la route l'appelle avec une tâche.
- **STAR nommé** : la route garde son message générique (« Ce STAR n'est pas en service… ») ;
  l'assistant vérifie avant, avec `findNotServing`, et nomme chaque STAR concerné.

## Écarts à l'implémentation (lot 3, compte rendu complet)

- **Même grille que l'écran** : un nouveau compte rendu part d'une section par département de
  l'événement, comme la page de saisie ; l'assistant peut ajouter un département de l'église ou
  une section libre, renommer ou supprimer une section.
- **Statistiques de l'écran seulement** : les champs par type de section (Accueil, Sainte-Cène,
  Intégration, Navette) sortent de la page dans `src/lib/report-stats.ts` et sont partagés ; une
  clé inconnue, une section sans statistiques ou un événement sans statistiques ⇒ refus explicite
  avec les clés attendues. Les valeurs fournies sont fusionnées clé par clé (`null` efface).
- **Entrée renommée** : `sections[].department` devient `sections[].label` (section existante ou
  département), avec `free`, `rename`, `remove`.
