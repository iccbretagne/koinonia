# Exceptions sécurité acceptées — v1.0

## npm audit

| Package | Sévérité | CVE / GHSA | Raison | Plan de sortie |
|---|---|---|---|---|
| nodemailer | moderate | GHSA-… | Dépendance transitive de next-auth beta ; nodemailer@7 est requis mais @auth/core attend ^6.8.0. Aucun fix disponible sans changer next-auth. Impact runtime limité (SMTP sortant uniquement). | Résoudre avec la migration next-auth beta → stable (SEC-001). Réévaluer au 2026-07-17. |
| dompurify | moderate | — | Vulnérabilité transitive sans vecteur d'attaque identifié dans le contexte Koinonia (aucun HTML non maîtrisé sanitisé côté serveur). | Corriger via `npm audit fix` dès qu'un fix non-breaking est disponible (SEC-002). |
| hono | moderate | GHSA-458j-xx4x-4375 | Dépendance transitive de `prisma > @prisma/dev`. Non utilisé dans le code applicatif Koinonia (aucun import hono dans `src/`). La vulnérabilité concerne le rendu JSX SSR de hono, hors périmètre. | Fix disponible dans hono ≥ 4.12.14 — bloqué par la version de `@prisma/dev`. Réévaluer à la prochaine mise à jour Prisma (SEC-005). |
| @hono/node-server | moderate | GHSA-92pp-h63x-v22m | Dépendance transitive de `prisma > @prisma/dev`. Non utilisé dans le code applicatif. La vulnérabilité concerne `serveStatic` avec des slashes répétés, sans vecteur d'attaque dans Koinonia. | Fix disponible dans @hono/node-server ≥ 1.19.13 — bloqué par `@prisma/dev`. Réévaluer à la prochaine mise à jour Prisma (SEC-005). |
| fast-uri | **high** | GHSA-q3j6-qgpj-74h6 GHSA-v39h-62p7-jpjc | Dépendance transitive (`ajv` ou `uri-js` via plusieurs packages). Koinonia n'expose pas d'URI contrôlées par l'utilisateur qui transitent par `fast-uri`. Fix disponible dans fast-uri > 3.1.1 — bloqué par la version de l'écosystème amont. | Corriger via `npm audit fix --force` dès qu'un fix non-breaking est disponible (SEC-006). Réévaluer au 2026-08-01. |
| postcss | moderate | GHSA-qx2v-qp2m-jg93 | Dépendance transitive de `next` (node_modules/next/node_modules/postcss). Vulnérabilité XSS via une balise `</style>` non échappée dans le stringify CSS — uniquement lors du build/compilation. Aucune exécution postcss en runtime sur les requêtes utilisateur. | Fix disponible dans postcss ≥ 8.5.10 — bloqué par la version embarquée dans next. Résoudre lors de la prochaine mise à jour next (SEC-007). |
| next / next-auth / prisma | moderate | — (transitive) | Ces trois packages figurent dans l'audit comme vecteurs de vulnérabilités transitives déjà documentées ci-dessus (postcss, nodemailer, hono). Pas de CVE direct sur le code de ces packages dans la version utilisée. | Résoudre avec les tickets SEC-001, SEC-005, SEC-007. |
| @auth/core / @auth/prisma-adapter | low | — (transitive) | Dépendances transitives de next-auth beta ; aucune CVE directement exploitable identifiée dans le contexte Koinonia. | Résoudre avec SEC-001 (migration next-auth beta → stable). |

## npm ls (arbre invalide)

next-auth beta (v5 beta) exige nodemailer@^6.8.0 mais nodemailer@7.x est installé.
Résolu partiellement : aucune incompatibilité runtime connue. Ticket SEC-001.

## Limitations de scope connues

| Élément | Description | Risque | Plan |
|---|---|---|---|
| `user.displayName` global | `POST /api/member-user-links` écrit `displayName` sur le modèle `User` global lors de la liaison STAR↔compte. Si un utilisateur appartient à plusieurs églises, la liaison dans l'église B peut écraser le nom défini par l'église A. | Faible — impact cosmétique limité à l'affichage du nom ; aucun accès ni élévation de privilège. Nécessite que l'utilisateur soit admin dans deux églises simultanément. | Migrer `displayName` vers `MemberUserLink` lors d'une refonte multi-tenant (pas de ticket urgent). |
| `GET /api/users/search` cross-tenant | Initialement identifié comme risque T11. Vérifié : la requête filtre sur `churchRoles.churchId` et `memberLinkRequests.churchId`, protégée par `requireChurchPermission("members:manage", churchId)`. Pas de fuite cross-tenant. | Aucun | Fermé comme faux positif. |

## `workflow_dispatch` sans vérification CI (SEC-008)

Le déclencheur `workflow_dispatch` du workflow `deploy.yml` permet de lancer un déploiement en spécifiant une version sans vérifier que le SHA cible a passé la CI. Le chemin normal (`workflow_run` déclenché automatiquement après CI verte sur un tag `v*`) est lui protégé.

**Risque accepté** : seuls les mainteneurs disposant d'un accès en écriture au dépôt peuvent déclencher `workflow_dispatch`. C'est intentionnellement une trappe d'urgence (hotfix hors cycle normal). Le step `Check tag matches package.json` garantit que la version déclarée correspond au code checké. La surface d'attaque externe est nulle.

**Conditions de réévaluation** : si le dépôt passe en organisation avec des contributeurs extérieurs disposant du rôle `write`, ajouter une vérification du statut CI du SHA via `gh api repos/{owner}/{repo}/commits/{sha}/check-runs`.

## Tickets de suivi

- **SEC-001** : Migrer next-auth beta → stable (v5 stable ou équivalent)
- **SEC-002** : `npm audit fix` pour dompurify
- **SEC-003** : Ajouter tests P0-1 pour `media-projects/[id]/share`
- **SEC-004** : Audit trail validateur media (tokenId, timestamp, statut précédent) — HIGH-2 partiel
- **SEC-005** : Mettre à jour hono / @hono/node-server via mise à jour Prisma
- **SEC-006** : Corriger fast-uri (high) — `npm audit fix` dès disponibilité d'un fix non-breaking
- **SEC-007** : Mettre à jour postcss via upgrade next
- **SEC-008** : `workflow_dispatch` sans vérification CI — risque accepté (mainteneurs uniquement), réévaluer si accès write élargi
