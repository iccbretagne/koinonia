# ADR-0031 — Sites d'événement : routage par hôte et domaines dédiés

- **Statut** : Accepté
- **Date** : 2026-11-21

## Contexte

Un événement de billetterie peut avoir un site propre (spec 084) : thème, pages et blocs composés
par l'organisateur, sur une adresse qui lui ressemble. Ce contenu est public, créé par des comptes
de l'église, et doit pouvoir vivre sur un autre domaine que l'application. Il ne doit jamais
donner accès à l'application (administration, API, Auth.js) ni voir ses cookies de session.

## Décision

- **Un seul déploiement, un routage par hôte dans `src/proxy.ts`.** Un hôte `<slug>.<SITE_BASE_DOMAIN>`
  (en production `*.evenements.iccrennes.fr`) ou un domaine dédié approuvé (lot 3) est un **hôte de
  site**. Tout autre hôte garde le comportement de l'application, inchangé.
- **Liste blanche de chemins sur un hôte de site** : `/` et `/<page>` (réécrits vers
  `/site/<siteSlug>/…`), `/inscription`, `/reservation`, `/billet`, `/api/ticketing/public`,
  `/_next`, `/favicon.ico`. **Tout le reste répond 404**, y compris `/admin`, `/api/auth`,
  `/api/users`, `/billetterie` et `/site/…` tapé directement. Le matcher du proxy inclut les
  chemins avec extension pour que cette liste s'applique aussi à eux.
- **Sur l'hôte de l'application**, `/site/…` répond 404 : un site n'est servi que par son hôte
  (l'aperçu de l'éditeur rend les mêmes composants dans l'onglet Site).
- **Aucun cookie** n'est lu ni transmis sur un hôte de site (l'en-tête `Cookie` est retiré de la
  requête relayée). Les cookies Auth.js sont posés **sans attribut `Domain`** : jamais envoyés à
  un sous-domaine ; un test échoue si un `domain` apparaît dans la configuration.
- **CSP propre aux sites** (`buildSiteCsp`) : aucune origine externe, `img-src 'self' data:`,
  `connect-src 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'none'`, nonce
  pour les scripts. Turnstile n'est autorisé que sous `/inscription`.
- **Aucun HTML ni style libre stocké** : le document du site est un arbre validé par Zod ; les
  couleurs sont des hexadécimaux validés posés en variables CSS, les fonds des énumérations
  traduites par le serveur, les polices une liste fermée, les liens limités à https, mailto ou une
  page du site. Les images sont réencodées en WebP sans métadonnées et ne sont servies au public
  que si la version **publiée** d'un site actif les référence.
- **Domaines dédiés (lot 3)** : vérification DNS, approbation par le Super Admin, puis fournisseur
  HTTP de Traefik (`GET /api/internal/traefik`, localhost et jeton) qui ajoute un routeur par domaine
  approuvé avec certificat Let's Encrypt. Le sous-domaine par défaut repose sur **un certificat
  joker** (défi DNS). Le proxy ne consulte jamais la base : `isApprovedSiteHost` lira un cache.

## Alternatives considérées

- **Application Next.js séparée pour les sites** — double déploiement et double accès aux données
  publiques, pour un gain d'isolation que la liste blanche et l'absence de cookies fournissent déjà.
- **Caddy « on-demand TLS »** — imposerait de changer de reverse proxy en production.
- **Markdown ou HTML stocké puis assaini** — une seule faille d'assainissement suffit, et une
  dépendance de plus.

## Conséquences

- L'isolation repose sur trois garanties testées : la liste blanche du proxy, l'absence de cookie
  sur les hôtes de site, la CSP. Toute nouvelle route publique à exposer sur un hôte de site doit
  être ajoutée explicitement à la liste.
- L'inscription, la réservation et le billet sont joignables depuis n'importe quel hôte de site
  (ils restent publics, sans session) ; seul le thème du site publié les habille.
- Le certificat joker et l'enregistrement DNS `*.evenements.iccrennes.fr` sont des actions
  d'exploitation, hors code.

## Références

- Spec 084 (`specs/084-site-evenement/`), ADR-0012 (surface HTTP des modules), ADR-0022 (CSP).
