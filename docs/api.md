# API

Les routes API sont des [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
Next.js dans `src/app/api/`. Ce document décrit les conventions communes. **La référence des
endpoints** (accès, paramètres, corps, réponses, règles métier) est générée depuis le code
(ADR-0023) :

- **`docs/openapi.json`** : spécification OpenAPI 3.0, à jour à chaque commit (un test échoue
  sinon) ;
- **`/admin/api`** : la même spécification affichée avec Swagger UI, réservée au Super Admin
  (Administration → Plateforme → API).

## Format des réponses

**Succès** : JSON avec les données directement dans le corps (statut `200`, `201` à la création).
Quelques routes renvoient autre chose, indiqué dans leur contrat : export (`.xlsx`, `.csv`, `.zip`),
flux audio, redirection.

**Erreur** : `{ "error": "Message" }`, avec en plus `details` quand le corps ne passe pas la
validation Zod :

```json
{ "error": "Données invalides", "details": [{ "field": "email", "message": "Email invalide" }] }
```

| Code | Sens |
|---|---|
| `400` | Corps ou paramètre invalide, règle métier non respectée (`ApiError`) |
| `401` | Pas de session (`Not authenticated`) |
| `403` | Session sans le droit requis dans l'église visée (`Insufficient permissions`) ou objet hors périmètre |
| `404` | Objet introuvable — ou module désactivé sur l'instance (ADR-0012) |
| `409` | Conflit (doublon, état incompatible) |
| `410` | Ressource qui n'est plus disponible (lien révoqué, culte dépublié) |
| `429` | Débit dépassé |
| `500` | Erreur inattendue (journalisée, message générique) |

## Authentification et église visée

- Session NextAuth (cookie `authjs.session-token`, Google OAuth). Sans session, le proxy
  (`src/proxy.ts`) répond `401` à toute route API, sauf les adresses ouvertes : poignée de main
  `/api/auth/*`, `/api/csp-report`, `/api/cron/*` (jeton porteur `CRON_SECRET`) et les adresses
  publiques déclarées par les manifestes de modules (`routes.public` : formulaires publics, liens de
  partage par jeton).
- **Permissions** : chaque contrôle se fait **dans une église précise** (`requireChurchPermission`).
  L'église vient du corps ou du paramètre `churchId`, ou, pour une action sur un objet identifié, de
  l'objet lui-même (`resolveChurchId`) — jamais du contexte d'église affiché.
- **Église courante** : les routes qui n'agissent pas sur un objet identifié et ne prennent pas de
  `churchId` utilisent l'église choisie dans le sélecteur, stockée dans le cookie `current-church`
  (`POST /api/current-church`).
- Le champ **Accès** de chaque opération (et l'extension `x-access`) donne la permission requise,
  `session` (toute personne connectée, contrôle objet par objet décrit à côté), `superAdmin`,
  `cron`, `token` ou `public`. La matrice rôles × permissions est dans [auth.md](auth.md#permissions).

## Limitation de débit

Les mutations sensibles appellent `requireRateLimit` (`src/lib/rate-limit.ts`), par utilisateur ou
par adresse IP pour les routes publiques. Préréglages : mutation 30/min, opération sensible 10/min,
authentification 10/min. Au-delà : `429`. Le compteur est en mémoire, propre à chaque instance.

## Ajouter ou modifier une route

1. Écrire la route (`route.ts`) selon le patron de [architecture.md](architecture.md) : garde
   d'accès, `await params`, `successResponse`/`errorResponse`.
2. Écrire son **contrat** dans un `contract.ts` voisin : les schémas Zod des corps (que la route
   importe et valide, la documentation ne peut donc pas diverger) et `export const contract =
   defineContract({ GET: {…}, POST: {…} })` avec `summary`, `access`, `accessNote`, `description`
   (règles métier, effets de bord), `query`, `body`, `response`, `status`. Le contrat est un module
   pur : il n'importe que `zod`, `@/lib/openapi/contract`, `@/generated/prisma/enums`, les
   `src/modules/*/schemas.ts` et d'autres contrats (règle dependency-cruiser `api-contract-pure`).
3. Déclarer la route dans le manifeste de son module (ADR-0012).
4. Régénérer la spécification : `npm run openapi`, puis commiter `docs/openapi.json`.

Le test `src/lib/openapi/__tests__/openapi.test.ts` échoue si une route n'a pas de contrat, si le
contrat ne couvre pas exactement ses méthodes, si une opération se dit publique sans l'être au
manifeste, ou si `docs/openapi.json` n'est pas à jour.
