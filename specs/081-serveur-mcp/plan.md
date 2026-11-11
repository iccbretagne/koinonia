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
  `audio.recentSermons`, `reports.recent` (jamais les notes ni les décisions d'un compte rendu).
- Les réponses sont bornées à 8 lignes par question (même limite que l'assistant), avec le total
  et le lien vers l'écran.
