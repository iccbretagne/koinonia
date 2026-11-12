# Tâches — Connecter un assistant IA à Koinonia (serveur MCP)

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0029-serveur-autorisation-oauth-mcp.md`
- **Statut** : Lots 1, 2 et 3 terminés

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> **Lot 1** (lecture seule) = T1 à T34, livrable seul. **Lot 2** (actions confirmées) = T35 à T40,
> après validation du lot 1.

## Prérequis

- [x] Branche de travail à jour depuis `main`
- [x] Dépendance `@modelcontextprotocol/sdk` (version exacte) ajoutée, `npm audit` sans alerte haute
- [x] Migration Prisma générée

## Lot 1 — lecture seule

### 1. Données & migration

- [x] **T1** — Modèles `McpClient`, `McpGrant`, `McpToken` (+ enum `McpTokenKind`),
      `McpSettings`, `McpChurchSettings`, `McpCall` ; relations `User`/`Church` ; migration
      `mcp_connections` *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…`)*

### 2. Module `mcp` (manifeste et services)

- [x] **T2** — Module `mcp` : manifeste (routes `authenticated` `/mcp/autoriser`,
      `/profile/assistants`, `/admin/mcp` ; `api` `/api/mcp` ; `public` OAuth et serveur MCP),
      ajout à `ENABLED_MODULES` par défaut, aucune permission *(fichiers :
      `src/modules/mcp/manifest.ts`, `index.ts`, `src/lib/registry.ts` ou équivalent)*
- [x] **T3** — Jetons : génération (`crypto.randomBytes`), empreinte SHA-256, comparaison à
      temps constant, durées (code 5 min, accès 1 h, refresh 90 j glissants)
      *(fichier : `src/modules/mcp/services/tokens.ts`)*
- [x] **T4** — Enregistrement de client (RFC 7591) : validation des `redirect_uris` (https
      exact, ou `http://localhost`/`127.0.0.1` ; pas de fragment), nom borné
      *(fichier : `src/modules/mcp/services/clients.ts`)*
- [x] **T5** — Autorisation : `createAuthorization(userId, churchId, clientId, redirectUri,
      codeChallenge, scope)` → code ; refus si fonction coupée ou compte sans rôle dans l'église
      *(fichier : `src/modules/mcp/services/authorize.ts`)*
- [x] **T6** — Échange : `exchangeCode` (PKCE S256, usage unique, `redirect_uri` identique,
      `resource` = `/api/mcp`) et `refresh` (rotation ; réutilisation ⇒ révocation de la
      connexion) ; `revokeToken` (RFC 7009) *(fichier : `src/modules/mcp/services/token-exchange.ts`)*
- [x] **T7** — Vérification d'un jeton d'accès : connexion non révoquée, fonction active
      (instance + église), compte encore membre ; `lastUsedAt` au plus une fois par minute
      *(fichier : `src/modules/mcp/services/verify.ts`)*
- [x] **T8** [P] — Connexions : lister (par compte, par église), révoquer (propriétaire ou
      Admin d'église, journalisé `logAudit`) *(fichier : `src/modules/mcp/services/connections.ts`)*
- [x] **T9** [P] — Réglages : interrupteur d'instance et par église (coupé par défaut),
      compteurs sans contenu ; journal des appels `recordCall` *(fichiers :
      `src/modules/mcp/services/settings.ts`, `calls.ts`)*
- [x] **T10** [P] — Tâche cron `mcp-maintenance` (quotidienne) : purge des jetons expirés et
      des appels de plus de 12 mois *(fichiers : `src/modules/mcp/services/maintenance.ts`,
      branchement cron existant)*

### 3. Session et outils

- [x] **T11** — Extraire la construction de la session du callback NextAuth en
      `buildSessionUser(userId)` réutilisable, sans changer le comportement
      *(fichier : `src/lib/auth.ts`)*
- [x] **T12** [P] — Nouvelles questions de données : `audio.recentSermons` (`audio:listen`),
      `reports.recent` (`reports:view`) *(fichiers : `src/app/api/assistant/_data/…`,
      `_data-questions.ts`)*
- [x] **T13** — Catalogue d'outils MCP : liste blanche `MCP_TOOLS` (questions du lot 1, sans
      `treasury.*`), nom MCP, description, schéma d'entrée, filtrage par audience du viewer,
      outil `guide_search` (fiches de l'assistant filtrées) *(fichier : `src/app/api/mcp/_tools.ts`)*
- [x] **T14** — Rendu d'un résultat : texte (titre, lignes, lien absolu vers l'écran) +
      `structuredContent` ; refus = même message qu'une absence *(fichier : `src/app/api/mcp/_render.ts`)*

### 4. API (route handlers + contrats)

- [x] **T15** — Métadonnées : `/.well-known/oauth-protected-resource` (et `/…/api/mcp`),
      `/.well-known/oauth-authorization-server` ; déclaration des routes (manifeste ou
      `NOYAU_ROUTES`) ; vérifier le passage par `src/proxy.ts`
- [x] **T16** — `POST /api/mcp/oauth/register` (Zod, débit limité par IP)
- [x] **T17** — `POST /api/mcp/oauth/authorize` (session NextAuth, contrôle d'origine,
      redirection avec `code`/`state` ou `error=access_denied`)
- [x] **T18** — `POST /api/mcp/oauth/token` (`application/x-www-form-urlencoded`, erreurs OAuth
      normalisées `invalid_grant`…) et `POST /api/mcp/oauth/revoke`
- [x] **T19** — `POST /api/mcp` : jeton Bearer (401 + `WWW-Authenticate` avec
      `resource_metadata`), débit 60/min/compte (429), serveur MCP sans état
      (`WebStandardStreamableHTTPServerTransport`), `tools/list` filtré, `tools/call` journalisé ;
      `GET`/`DELETE` → 405 *(fichier : `src/app/api/mcp/route.ts`)*
- [x] **T20** [P] — `GET /api/mcp/connections`, `DELETE /api/mcp/connections/[id]`
- [x] **T21** [P] — `GET`/`PUT /api/mcp/church/[churchId]` (`church:settings`)
- [x] **T22** [P] — `GET`/`PUT /api/mcp/settings` (`requireSuperAdmin`)
- [x] **T23** — Contrats de toutes les routes, `npm run openapi`

### 5. UI

- [x] **T24** — Écran d'autorisation `/mcp/autoriser` : client, choix de l'église (seulement
      celles où la fonction est active), ce qui sera lu, phrase sur l'envoi au fournisseur d'IA,
      Autoriser / Refuser ; `frame-ancestors 'none'` *(fichiers :
      `src/app/(auth)/mcp/autoriser/page.tsx`, client)*
- [x] **T25** — « Mon profil › Assistants connectés » `/profile/assistants` : adresse du serveur
      à copier, mode d'emploi (Claude, ChatGPT, Claude Code), liste et Révoquer ; lien depuis
      « Mon profil »
- [x] **T26** [P] — Paramètres de l'église : carte « Assistants IA (MCP) » (interrupteur,
      comptes connectés, révocation) *(fichier : `src/app/(auth)/admin/churches/[churchId]/…`)*
- [x] **T27** [P] — `/admin/mcp` (Super Admin) : interrupteur, compteurs ; entrée dans
      l'administration

### 6. Documentation

- [x] **T28** [P] — Guide, fiche de l'assistant (« Connecter mon assistant IA »), `CLAUDE.md`
      (spécificités du module), `docs/database.md`, `docs/auth.md` (OAuth MCP), `CHANGELOG.md`,
      ADR-0029 → Accepté

### 7. Tests

- [x] **T29** — OAuth : métadonnées ; enregistrement (URI refusées) ; autorisation (fonction
      coupée, compte sans rôle, refus) ; échange (PKCE faux, code réutilisé, `redirect_uri`
      différent, code expiré, `resource` étrangère) ; refresh (rotation, réutilisation ⇒
      révocation) ; révocation *(fichiers : `src/modules/mcp/services/__tests__/…`)*
- [x] **T30** — Serveur : 401 + `WWW-Authenticate` ; connexion révoquée / expirée / fonction
      coupée / compte sans rôle ⇒ refus ; débit ; journalisation sans contenu
      *(fichier : `src/app/api/mcp/__tests__/server.test.ts`)*
- [x] **T31** — Outils : `tools/list` par rôle (STAR, Resp. département, Secrétaire,
      Comptable) ; aucun `treasury.*`, aucune donnée `care` ; refus = message d'absence
      *(fichier : `src/app/api/mcp/__tests__/tools.test.ts`)*
- [x] **T32** [P] — Connexions et réglages : révocation par le propriétaire et l'Admin d'église
      (autre église : 404), interrupteurs, `buildSessionUser` identique au callback
- [x] **T33** — Bout en bout local : client de la bibliothèque officielle → découverte →
      enregistrement → autorisation (Playwright) → `tools/list` → `tools/call`
- [x] **T34** — Revue de sécurité du lot 1 (OAuth, fuites, CSRF, redirections) et corrections

### 8. Retours de recette

- [x] **T34b** — `reports.recent` : « non renseigné » pour un orateur ou un titre vide
- [x] **T34c** — `reports.get` / outil `reports_get` (`reports:view`, jour ou plus récent,
      sections via `src/lib/report-stats.ts`, `anonymize`)
- [x] **T34d** — Plus de troncature dans `boundedAnswer` : 8 lignes dans la bulle, pagination
      `limit`/`offset` côté MCP avec `total` et `nextOffset`
- [x] **T34e** — Libellés nettoyés, type d'événement en clair, total juste pour la file du
      secrétariat
- [x] **T34f** — Instructions du serveur : lecture seule et pagination ; candidats à l'écriture
      listés dans `plan.md`

## Lot 2 — actions avec confirmation (après validation du lot 1)

- [x] **T35** — Jeton de confirmation (5 min, usage unique, lié au compte, à l'église et aux
      paramètres) *(fichier : `src/modules/mcp/services/confirmations.ts`)*
- [x] **T36** — `declare_unavailability_preview` / `_confirm` (service existant de
      `@/modules/planning`, `logAudit` `via: "mcp"`)
- [x] **T37** — `answer_service_preview` / `_confirm`
- [x] **T38** — `draft_request` : lien vers « Nouvelle demande » prérempli (annonce, visuel, ajout d'événement), sans écriture — décision du 2026-11-12, voir `plan.md`
- [x] **T39** — Portée `write` à l'autorisation (case explicite sur l'écran), outils d'écriture
      masqués sans elle
- [x] **T40** — Tests du lot 2 : confirmation obligatoire, jeton rejoué/expiré/autres
      paramètres refusés, droits revérifiés, journalisation « via l'assistant IA »

## Lot 3 — actions des responsables (3 PR successives)

> Même mécanique qu'au lot 2 (`…_preview` / `…_confirm`, jeton `kmx_`, résumé figé,
> `logAudit` `via: "mcp"`), plus une **empreinte de l'état lu** revérifiée à la confirmation.
> Chaque cœur extrait garde le comportement HTTP de sa route : ses tests existants passent sans
> modification.

### Socle (avec 3a)

- [x] **T41** — Catalogue des actions en dossier `src/app/api/mcp/_actions/` (`index.ts` :
      catalogue, `actionsFor(viewer, session, write)` par permission ; `personal.ts` : actions du
      lot 2 déplacées sans changement ; `draft.ts` : `draft_request`)
- [x] **T42** — Empreinte d'état : `fingerprint(value)` (SHA-256 d'une sérialisation triée) et
      refus commun « Les données ont changé depuis l'aperçu » *(fichier :
      `src/app/api/mcp/_actions/common.ts`)*
- [x] **T43** — Instructions du serveur listant les actions disponibles pour ce compte et la
      consigne planning (« ni compétences ni effectif : demande-les au responsable »)
      *(fichier : `src/app/api/mcp/server/route.ts`)*
- [x] **T44** [P] — Corriger les 3 remarques SonarCloud reportées du lot 2 (ternaire imbriqué de
      `RequestForm.tsx`, `draftRequest` sans `await`, espacement JSX de `/mcp/autoriser`)

### 3a — Planning

- [x] **T45** — Extraire `savePlanning(session, eventId, departmentId, plannings)` de
      `PUT …/departments/[deptId]/planning` *(fichier : `…/planning/_core.ts`, route allégée)*
- [x] **T46** — Extraire `duplicatePlanning(session, sourceEventId, targetEventId)` de
      `POST …/duplicate-planning` *(fichier : `…/duplicate-planning/_core.ts`)*
- [x] **T47** — Extraire `saveNotice(session, departmentId, eventId, content)` de
      `PUT /api/departments/[id]/notices` *(fichier : `…/notices/_core.ts`)*
- [x] **T48** — Lectures : `planning_eventsToStaff` (événements à venir du périmètre,
      départements, état de la grille, identifiants) et `planning_candidates(eventId,
      departmentId)` (état par STAR depuis `getPlanningAvailability`, désistement en attente,
      service ailleurs le même jour, statut actuel, services des 60 derniers jours ; sans
      coordonnée) *(fichiers : `src/app/api/assistant/_data/planning-staff.ts`, `MCP_TOOLS`)*
- [x] **T49** — `fill_planning_preview` / `_confirm` : signalements par STAR (absent, pas
      disponible, en service ailleurs), différence avec la grille actuelle, empreinte de la
      grille et des absences/réponses des STAR proposés
- [x] **T50** — `copy_planning_preview` / `_confirm` : ce qui est recopié par département, STAR
      devenus absents ou pas disponibles signalés, empreinte de la grille cible
- [x] **T51** — `remind_unanswered_preview` / `_confirm` : nombre de STAR relancés par
      département (sans nom), règle « une fois par jour » de `manualRelance`
- [x] **T52** — `publish_notice_preview` / `_confirm` : consigne remplacée montrée, ≤ 2 000
      caractères, empreinte de la consigne existante
- [x] **T53** — Tests 3a : cœurs (session, périmètre, date limite), routes inchangées, outils
      (aperçu sans écriture, confirmation unique, hors périmètre, empreinte changée, outil
      absent sans `planning:edit`), lectures sans coordonnée

### 3b — Pour un STAR et compte rendu

- [x] **T54** — Extraire `declareAbsenceAs(session, churchId, input)` de `POST /api/absences`
      et `answerAs(session, churchId, memberId, answers)` de `PUT /api/availability`
      *(fichiers : `src/app/api/absences/_core.ts`, `src/app/api/availability/_core.ts`)*
- [x] **T55** — Extraire `saveReport(session, eventId, input)` de `PUT /api/events/[id]/report`
      *(fichier : `…/report/_core.ts`)*
- [x] **T56** — `declare_unavailability_for_preview` / `_confirm` et `answer_service_for_preview`
      / `_confirm` (`absences:manage` / `planning:edit`, STAR du périmètre, « saisi pour … »)
- [x] **T57** — `fill_report_preview` / `_confirm` : rubriques saisies et remplacées, sections
      reprises du compte rendu existant ou des départements en service, empreinte du compte rendu
- [x] **T58** — Tests 3b (mêmes cas qu'en T53, plus : STAR sorti du périmètre entre aperçu et
      confirmation, comptes rendus désactivés)

### 3c — Événements et salles

- [x] **T59** — Extraire `createEvents(session, churchId, occurrences, departmentIds)` de
      `POST /api/events` (+ rattachement des départements) *(fichier : `src/app/api/events/_core.ts`)*
- [x] **T60** — `rooms_available(day, start, end)` (salles autorisées et libres)
- [x] **T61** — `create_events_preview` / `_confirm` : 1 à 12 occurrences, doublons signalés,
      transaction unique ; `reserve_room_preview` / `_confirm` (`createReservation`, conflit =
      refus)
- [x] **T62** — Tests 3c (13 dates refusées, date invalide ⇒ rien de créé, conflit de salle,
      `events:manage` / `rooms:reserve` requis)

### Lot 3 — tâches du département (constat de recette)

- [x] **T64** — Extraire le GET/PUT de `/api/events/[eventId]/departments/[deptId]/tasks` dans
      `src/modules/planning/services/task-assignment.service.ts` (`listEventTasks`,
      `assignEventTasks`, `listServingMembers`, `findNotServing`) ; la route l'appelle, ses tests
      inchangés
- [x] **T65** — Lecture `planning_tasks` (`planning:department` + périmètre, département non lié ⇒
      refus) et `assign_tasks_preview` / `_confirm` (`planning:edit` + périmètre, 30 tâches au
      plus, affectations des tâches citées remplacées, STAR pas en service nommé, empreinte)
- [x] **T66** — Tests du service et des outils (`task-assignment.service.test.ts`,
      `task-actions.test.ts`)

### Documentation (à chaque PR)

- [x] **T63** — `CLAUDE.md`, `docs/auth.md`, guide et fiche de l'assistant, écran
      d'autorisation (actions possibles selon le rôle), `CHANGELOG.md`, `npm run openapi`

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run openapi` sans diff restant
- [ ] Analyse SonarCloud de la PR sans bug (fiabilité A)
- [ ] Critères d'acceptation de `spec.md` relus un par un
- [ ] PR vers `main` (sur demande)

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Connexion de n'importe quel rôle sans code ni clé | T4–T6, T15–T18, T24, T29, T33 |
| Une connexion = un compte + une église | T5, T24, T29 |
| Données = ce que le compte voit à l'écran (STAR, RD, Secrétaire, Comptable) | T11, T13, T31 |
| Jamais suivi pastoral, coordonnées bancaires, coordonnées d'autrui | T13, T31, T34 |
| Révoquée / expirée / fonction coupée ⇒ cesse immédiatement | T7, T8, T30 |
| « Mon profil » liste et révoque | T8, T20, T25, T32 |
| Interrupteurs Super Admin et Admin d'église (coupé par défaut) | T9, T21, T22, T26, T27, T32 |
| Admin d'église : liste des comptes connectés et révocation | T8, T21, T26, T32 |
| Expiration après 90 jours d'inactivité | T3, T6, T10, T29 |
| Lot 2 : trois actions confirmées et journalisées | T35–T40 |
| Chaque appel journalisé sans contenu | T9, T19, T30 |
| Débit limité par compte | T19, T30 |
| Lot 1 sans aucune modification | T13, T31 |
| Lot 3 : chaque action réservée aux comptes qui la font dans l'application, aperçu puis confirmation | T41, T45–T62, T65 |
| Lot 3 : droits ou données changés depuis l'aperçu ⇒ refus | T42, T49–T52, T56, T57, T61 |
