# Tâches — Site d'événement de billetterie

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : En cours

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Multi-PR : sous-PR par lot vers `feat/site-evenement`, une PR finale vers `main`.
> À démarrer **après la release v1.38.0**.

## Prérequis

- [x] Branche créée : `feat/site-evenement`
- [x] À jour avec `main` après v1.38.0 (merge de `main`)
- [ ] DNS : `*.evenements.iccrennes.fr` → serveur Koinonia ; certificat joker (défi DNS) — action
      d'exploitation, hors code

## Lot 1a — Données, rôle, schémas (sous-PR 1)

- [x] **T1** — Migration `add_ticketing_sites` : `TicketingSite`, `TicketingSiteAsset`,
      `TicketingSiteDomain` (+ enum de statut), `TicketingRole.COMMUNICATION`,
      `TicketingSiteSettings` (une ligne par église, comme `McpChurchSettings`). *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…`)*
- [x] **T2** — Rôle `COMMUNICATION` : libellé, `EVENT_ACTIONS.site = ["ORGANIZER", "COMMUNICATION"]`,
      absent de `read`/`payments`/`configure`/`reception`/`catering`/`menu` ; attribuable dans
      l'onglet Équipe et par `set_ticketing_roles` (spec 083).
      *(fichiers : `src/modules/ticketing/auth.ts`, `schemas.ts`, onglet Équipe)*
- [x] **T3** [P] — Schémas purs du document : thème, `Background`, pages, sections, 11 blocs,
      liens autorisés, bornes. *(fichier : `src/modules/ticketing/site-schemas.ts`, exporté par
      `schemas.ts`)*
- [x] **T4** [P] — Texte riche : analyseur de Markdown restreint → arbre (h2/h3, paragraphes,
      listes, gras, italique, liens `https:`/`mailto:`/`page:`). *(fichier :
      `src/modules/ticketing/rich-text.ts`)*
- [x] **T5** [P] — Contraste WCAG 2.1 : luminance, ratio, pire cas (dégradé, voile sur
      noir/blanc), message et piste. *(fichier : `src/modules/ticketing/contrast.ts`)*
- [x] **T6** — Activation par l'église : service + `GET/PUT /api/ticketing/church/[churchId]/sites`
      (`church:settings`) + carte dans les paramètres de l'église. *(contrat, manifeste)*
- [x] **T7** — Tests du lot 1a : schémas (liens `javascript:`/`data:`/`http:` refusés, couleur
      hors palette refusée, bornes), analyseur (HTML saisi rendu comme texte), contraste (valeurs
      de référence, pire cas), matrice `EVENT_ACTIONS` avec `COMMUNICATION`.

## Lot 1b — Images, routage, accueil, publication (sous-PR 2)

- [x] **T8** — `site-assets.ts` : téléversement (8 Mo, `sniffImage`, `sharp` rotate/≤2400 px/WebP,
      métadonnées supprimées), lecture limitée aux assets publiés ou à l'équipe.
- [x] **T9** — `site.ts` : `createSite` (sous-domaine unique, mots réservés), `saveDraft`
      (Zod + contraste + assets du site), `publish`/`unpublish` (instantané, audit),
      `resolveSiteByHost`, `publicSiteView` (visibilité brouillon/publié/terminé).
- [x] **T10** — API d'édition : `site` (GET/POST/PUT), `site/publish` (POST/DELETE),
      `site/assets` (POST), `/site-assets/[assetId]` (GET public) — contrats ADR-0023, manifeste
      ADR-0012, `npm run openapi`.
- [x] **T11** — Routage par hôte dans `src/proxy.ts` : `SITE_BASE_DOMAIN`, liste blanche des
      chemins, réécriture vers `/site/[siteSlug]/…`, CSP propre aux sites, 404 sinon ; cache des
      hôtes. *(fichiers : `src/proxy.ts`, `src/lib/csp.ts`, `.env.example`)*
- [x] **T12** — Site public : `src/app/site/[siteSlug]/[[...page]]/page.tsx`, variables CSS du
      thème, polices `next/font` (liste fermée), fonds (couleur, dégradé, image + voile), page
      d'accueil (titre, accroche, date, lieu, bouton, compte à rebours).
- [x] **T13** — Thème appliqué à la page d'inscription existante (couleurs, logo, en-tête), sans
      changement de règles. *(fichier : `src/app/inscription/[churchSlug]/[eventSlug]/…`)*
- [x] **T14** — Onglet « Site » : thème (pastilles, polices, fond), accueil, aperçu (mêmes
      composants que le site), Publier/Dépublier, messages de lisibilité ; rôle Communication ne
      voit que Aperçu (sans chiffres) et Site.
- [x] **T15** — ADR-0031 « Sites d'événement : routage par hôte et domaines dédiés ».
      *(fichier : `docs/adr/0031-…md`, index `docs/adr/README.md`)*
- [x] **T16** — Tests du lot 1b : assets (faux type refusé, métadonnées absentes), proxy (hôte de
      site ⇒ `/admin`, `/api/users`, `/api/auth/*` en 404 ; pages autorisées réécrites ; CSP ;
      hôte inconnu ⇒ 404), **cookie de session sans attribut `Domain`**, visibilité
      (brouillon/publié), Communication refusé hors `site`.

## Lot 2 — Pages, blocs, pages automatiques (sous-PR 3)

- [x] **T17** — Rendu des 11 blocs (texte riche, image, galerie lazy, palette, cartes,
      à faire/à éviter, pictos, FAQ, bouton, bannière, séparateur) et des fonds de section.
- [x] **T18** — Pages automatiques Billetterie, Menus, Infos pratiques (depuis `getPublicEvent`,
      aucune donnée personnelle) ; navigation et icône « Retrouver ma réservation ».
- [x] **T19** — Éditeur des pages, sections et blocs (ajout, ordre, suppression, formulaire par
      type), bornes affichées.
- [x] **T20** — « Événement terminé » après clôture, `afterCloseDays` (30 par défaut, réglable),
      puis 404.
- [x] **T21** — Tests du lot 2 : chaque bloc rendu sans HTML brut ; pages automatiques à jour
      après changement de tarif/plat/lieu et sans email/téléphone/nom d'inscrit ; « terminé »
      puis 404 ; reconstitution de la page « Dress code » de la maquette (test de document).

## Lot 3 — Domaines dédiés (sous-PR 4)

- [x] **T22** — `site-domains.ts` : demande (1 par site, 5 par église, refus des sous-domaines de
      `SITE_BASE_DOMAIN` et de l'hôte de l'application), vérification DNS (TXT + CNAME/A),
      approbation/refus Super Admin, `approvedHosts`.
- [x] **T23** — API : `site/domain` (GET/POST/DELETE), `site/domain/verify`,
      `/api/ticketing/site-domains` et `[domainId]` (Super Admin) ; écran d'approbation Super Admin ;
      guide DNS dans l'onglet Site.
- [x] **T24** — Recontrôle quotidien branché au cron : échec ⇒ `SUSPENDED` + notification de
      l'organisateur (domaine `ticketing` existant) ; redirection de l'adresse Koinonia vers le
      domaine approuvé ; liens des emails vers le domaine dédié.
- [x] **T25** — Fournisseur HTTP Traefik `GET /api/internal/traefik` (127.0.0.1 + jeton
      `TRAEFIK_PROVIDER_TOKEN`) ; documentation `docs/production.md` (fournisseur, joker, DNS).
- [x] **T26** — Tests du lot 3 : TXT absent ⇒ `PENDING` ; 6e domaine refusé ; recontrôle en échec ⇒
      `SUSPENDED` + notification ; domaine non approuvé ⇒ 404 ; fournisseur refusé sans jeton ou
      hors localhost.

## Lot 4 — Assistants IA (sous-PR 5)

- [x] **T28** — `src/app/api/mcp/_actions/site.ts` : lecture `ticketing_site` et actions
      `edit_ticketing_site_theme`, `edit_ticketing_site_page`, `edit_ticketing_site_block`,
      `publish_ticketing_site`, `request_ticketing_site_domain` via `eventAction` ; branchées dans
      `MCP_ACTIONS` ; libellés dans `ACTION_LABELS`.
- [x] **T29** — Tests : rôle Communication autorisé sur le site et refusé sur le domaine ;
      observateur et STAR sans rôle refusés ; contraste ou lien interdit refusés dès l'aperçu ;
      changement concurrent ⇒ `CHANGED` ; texte Markdown converti en arbre.

## Documentation

- [x] **T27** [P] — Guide utilisateur (fiche « Site d'événement »), fiches de Nia, `docs/auth.md`
      (rôle Communication), `docs/database.md`, `CLAUDE.md` (rôle Communication, site d'événement),
      CHANGELOG.

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run openapi` et `docs/openapi.json` commité
- [ ] Critères d'acceptation de `spec.md` :
  - publication sur adresse Koinonia → T9–T12, T14
  - thème sur l'inscription → T13
  - contraste refusé (dégradé, image) → T5, T7
  - fonds couleur/dégradé/image par page et bande → T3, T12, T17
  - page « Dress code » composable → T17, T21
  - pages automatiques à jour → T18, T21
  - aucun script ni ressource externe → T3, T4, T11, T16
  - aucune donnée personnelle → T18, T21
  - brouillon invisible → T9, T16
  - domaine vérifié + approuvé, suspension auto → T22–T24, T26
  - pas d'application sur domaine dédié → T11, T16
  - activation par l'Admin → T6
  - publication journalisée → T9
  - rôle Communication → T2, T14, T16
  - « terminé » 30 jours → T20, T21
  - 5 domaines max → T22, T26
  - site piloté par l'assistant → T28, T29
- [ ] PR finale `feat/site-evenement` → `main`
