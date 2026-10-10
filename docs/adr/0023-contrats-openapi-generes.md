# ADR-0023 — Référence d'API générée depuis des contrats colocalisés

- **Statut** : Accepté
- **Date** : 2026-10-10

## Contexte

La référence de l'API vivait dans `docs/api.md`, écrite à la main. Au 2026-10-10, elle ne
documentait que 103 des 202 routes : modules entiers absents (comptabilité, care, intégration,
salles, emploi…), et rien ne signalait une nouvelle route non documentée. Chaque feature
l'aggravait.

Les routes valident déjà leurs corps avec Zod, mais les schémas sont déclarés dans `route.ts`,
qui importe Prisma, NextAuth et S3 : un générateur qui chargerait les routes devrait reproduire
les mocks des tests (essai fait : 202 échecs d'import sans mock de `next/server`).

## Décision

1. **Un `contract.ts` à côté de chaque `route.ts`**, pur : il n'importe que `zod`,
   `@/lib/openapi/contract`, `@/generated/prisma/enums`, d'autres contrats et les
   `src/modules/*/schemas.ts` (règle dependency-cruiser `api-contract-pure`). Il exporte les schémas Zod des corps — que `route.ts` importe pour valider — et un
   `contract = defineContract({ GET: {…}, POST: {…} })` qui décrit chaque méthode : résumé, règles
   métier, accès (`public`, `session`, `superAdmin`, `cron`, `token` ou une permission), paramètres
   de requête, corps, réponse en prose, statut de succès.
2. **`npm run openapi`** (`scripts/generate-openapi.ts`) assemble `docs/openapi.json`
   (OpenAPI 3.1, `@asteasolutions/zod-to-openapi`). Le tag de chaque adresse est son module
   propriétaire, lu dans les manifestes (ADR-0012). Le fichier est commité.
3. **Un test bloque la dérive** (`src/lib/openapi/__tests__/openapi.test.ts`) : toute route a un
   contrat couvrant exactement ses méthodes exportées, un accès `public` doit l'être aussi au
   manifeste, et `docs/openapi.json` doit correspondre aux contrats.
4. **Swagger UI** sur `/admin/api`, réservé au Super Admin (`swagger-ui-react`, chargé côté
   client sur cette seule page, servi depuis l'origine : compatible avec la CSP par nonce,
   ADR-0022).
5. **`docs/api.md` devient un guide** (format des réponses, authentification, erreurs, limitation
   de débit, déclarer un contrat) et renvoie à la référence générée. Les règles métier qu'il
   détaillait passent dans la `description` des contrats.

6. **`src/modules/X/schemas.ts`** : quand un schéma de corps appartient à un module (partagé
   avec ses services ou ses tests), il vit dans ce fichier pur (zod seul), troisième point
   d'entrée public d'un module après `index.ts` et `auth.ts` (règle
   `app-only-module-public-api`). Un schéma commun à plusieurs routes sans module se place dans
   un `contract.ts` partagé (ex. `src/app/api/_media-share/contract.ts`).

## Alternatives considérées

- **Compléter `docs/api.md` à la main** — même dérive qu'avant : rien ne la détecte.
- **Métadonnées exportées par `route.ts`, générateur qui charge les routes** — impose les mocks
  de Prisma/NextAuth/S3 à la génération ; fragile, et lie la documentation aux tests.
- **Analyse statique du code des routes (AST)** — reconstituer un schéma Zod depuis l'AST est
  hors de portée pour les schémas composés (`discriminatedUnion`, `refine`, constantes).
- **Swagger UI par CDN** — interdit par la CSP (`script-src` par nonce, sans origine externe).
- **Schémas de réponse typés pour chaque route** — les réponses ne sont pas validées
  aujourd'hui (`successResponse(data)`) : un schéma écrit à côté mentirait sans que rien ne le
  vérifie. Réponses décrites en prose ; un schéma de réponse pourra s'ajouter route par route
  quand la route le validera.

## Conséquences

- Une nouvelle route ne passe pas la CI sans contrat ; une méthode ajoutée non plus.
- Le schéma de corps documenté est celui qui valide : il ne peut pas diverger.
- Les paramètres de requête sont décrits dans le contrat mais encore lus à la main par les
  routes : ils peuvent diverger (le contrat fait foi pour la relecture).
- Modifier un contrat demande `npm run openapi` puis de commiter `docs/openapi.json`. La version
  du document (`info.version`) n'est pas vérifiée par le test : la régénérer à la release suffit.
- Les règles d'accès décrites (`access`, `accessNote`) sont déclaratives : la route reste seule
  juge. Un écart se corrige dans le contrat à la relecture.
- Deux dépendances : `@asteasolutions/zod-to-openapi` (dev, v7 pour Zod 3) et `swagger-ui-react`
  (page Super Admin seulement). Le passage à Zod 4 imposera la v8 du générateur.

## Références

- `src/lib/openapi/` (types, générateur, parcours), `scripts/generate-openapi.ts`
- `docs/openapi.json`, `docs/api.md`
- ADR-0012 (surface HTTP déclarée par les manifestes), ADR-0022 (CSP)
