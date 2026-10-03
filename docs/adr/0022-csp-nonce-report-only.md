# ADR-0022 — CSP stricte par nonce, déployée d'abord en Report-Only

- **Statut** : Accepté
- **Date** : 2026-10-04

## Contexte

L'audit de sécurité recommande de compléter la politique de sécurité du contenu (CSP). Koinonia
n'en publiait aucune : une injection de script (XSS) n'était limitée par rien côté navigateur, ni
dans les scripts qu'elle pouvait exécuter, ni dans les origines qu'elle pouvait contacter ou dans
lesquelles la page pouvait être encadrée.

L'application charge peu de ressources externes : Turnstile (Cloudflare) sur les formulaires
publics, l'API Adresse (data.gouv.fr), les avatars Google, et les URL présignées des stockages S3
(photos, visuels, audio, pièces comptables). Ses propres scripts sont ceux de Next.js et un seul
script inline : l'application du thème avant le premier rendu (`src/app/layout.tsx`).

Presque toutes les pages sont déjà rendues dynamiquement (session, église courante) : seules
`/_not-found` et `/module-absent` étaient statiques.

## Décision

1. **CSP stricte par nonce.** `src/proxy.ts` génère un nonce par requête et construit la
   politique (`src/lib/csp.ts`) : `script-src 'self' 'nonce-…' 'strict-dynamic'`, sans
   `'unsafe-inline'` ni `'unsafe-eval'` en production. Next.js lit la politique dans l'en-tête de
   la **requête** et appose le nonce sur ses scripts ; le layout racine le lit via `headers()`
   pour le script de thème. `'strict-dynamic'` couvre les scripts chargés par un script de
   confiance (Turnstile, injecté par `TurnstileWidget`).
2. **Origines externes énumérées** par directive (`img-src`, `media-src`, `connect-src`,
   `frame-src`, `form-action`), les origines S3 étant dérivées au runtime des variables
   `*_S3_ENDPOINT` — elles diffèrent entre recette et production.
3. **`style-src 'self' 'unsafe-inline'`** : les attributs `style=""` (couleur d'église,
   positions calculées) ne peuvent pas porter de nonce ; le risque résiduel d'une injection de
   style est sans commune mesure avec celui d'un script.
4. **Report-Only d'abord.** L'en-tête publié est `Content-Security-Policy-Report-Only` ; le
   navigateur signale les violations à `POST /api/csp-report` (public, borné en débit et en
   taille, journalisé, jamais stocké) sans rien bloquer. `CSP_ENFORCE=true` bascule vers
   l'en-tête bloquant, sans redéploiement de code.
5. **Pages uniquement** : la politique n'est pas posée sur `/api/*`, qui ne rend pas de HTML.

## Alternatives considérées

- **`script-src 'self' 'unsafe-inline'`** (sans nonce) : n'oblige à rien de dynamique, mais
  laisse passer précisément ce qu'une CSP doit arrêter — un script injecté dans la page.
  Écartée : la contrainte du rendu dynamique est déjà quasi satisfaite.
- **Hachés (`'sha256-…'`) au lieu d'un nonce** : compatibles avec des pages statiques, mais les
  scripts inline de Next.js changent à chaque build et à chaque page ; ingérable à la main.
- **En-têtes posés par Traefik** : statiques, donc incapables de porter un nonce par requête, et
  ignorants des origines S3 propres à chaque environnement. Traefik garde HSTS et les en-têtes
  fixes (`docs/production.md` § Durcissement).
- **Activer directement en bloquant** : une origine oubliée (un fournisseur S3, un
  formulaire public) casserait une fonctionnalité en production sans signal préalable.

## Conséquences

- Le layout racine lit `headers()` : toutes les pages sont rendues dynamiquement (les deux
  seules pages statiques ne l'étaient que par accident). Aucune page n'est donc mise en cache
  statique — choix assumé, l'application étant authentifiée de bout en bout.
- Toute nouvelle ressource externe (script, image, API appelée du navigateur, iframe) doit être
  ajoutée à `src/lib/csp.ts` — sinon elle apparaît dans les rapports, puis est bloquée une fois
  `CSP_ENFORCE=true`.
- Les violations se lisent dans le journal (`journalctl -u koinonia | grep "csp: violation"`).
  Extensions de navigateur et outils de traduction en produisent aussi : bruit à écarter avant
  de conclure à une origine manquante.
- Passage en bloquant : après une période d'observation sans violation propre à l'application,
  en recette puis en production (`CSP_ENFORCE=true` dans `shared/.env`, redémarrage du service).

## Références

- `src/lib/csp.ts`, `src/proxy.ts`, `src/app/api/csp-report/route.ts`, `src/app/layout.tsx`
- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
- `docs/production.md` § Politique de sécurité du contenu
