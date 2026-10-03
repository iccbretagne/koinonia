# Exceptions sécurité acceptées — v1.0

## npm audit

**État au 2026-10-03** : `npm audit --omit=dev` → **0 vulnérabilité** (dépendances embarquées en
production), après la mise à jour de `dompurify` en 3.4.16.

Les exceptions précédemment listées ici (nodemailer, dompurify, hono, @hono/node-server,
fast-uri, postcss, et les entrées transitives next / next-auth / prisma / @auth/*) sont
**closes** : les versions installées ne sont plus signalées par `npm audit`.

`dompurify` n'est d'ailleurs exécuté par aucun export PDF : c'est une dépendance optionnelle de
jsPDF, utilisée uniquement par `doc.html()`, que le code n'appelle pas (les exports passent par
l'API de dessin de jsPDF, `text`, `line`…).

Restent des alertes **sur les seules dépendances de développement** (chaîne ESLint/Babel :
`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`, `brace-expansion`,
`browserslist`, `js-yaml`, `@humanfs/node`, `@babel/core`) : exécutées en CI et sur les postes de
développement, jamais par le serveur. Elles sont traitées par les mises à jour Dependabot
(minor/patch) ou à la prochaine montée de version de Next.js.

## Limitations de scope connues

| Élément | Description | Risque | Plan |
|---|---|---|---|
| `user.displayName` global | `POST /api/member-user-links` écrit `displayName` sur le modèle `User` global lors de la liaison STAR↔compte. Si un utilisateur appartient à plusieurs églises, la liaison dans l'église B peut écraser le nom défini par l'église A. | Faible — impact cosmétique limité à l'affichage du nom ; aucun accès ni élévation de privilège. Nécessite que l'utilisateur soit admin dans deux églises simultanément. | Migrer `displayName` vers `MemberUserLink` lors d'une refonte multi-tenant (pas de ticket urgent). |
| `GET /api/users/search` cross-tenant | Initialement identifié comme risque T11. La recherche par nom reste filtrée sur `churchRoles.churchId`/`memberLinkRequests.churchId`, protégée par `requireChurchPermission("members:manage", churchId)` — pas de fuite cross-tenant sur ce volet. Décision ultérieure (spec 037, 2026-09) : ajout d'une correspondance **exacte** par email, cross-tenant, pour rattacher un compte déjà lié à un STAR d'une autre église (aucun rôle ni demande dans l'église courante, donc invisible à la recherche par nom). | Faible — révèle l'existence d'un compte pour une adresse email déjà connue de l'appelant (pas d'énumération : correspondance exacte uniquement, jamais de `contains`). Borné par `members:manage` sur l'église courante. | Accepté en l'état. Réévaluer si un flux d'invitation dédié rend cette recherche inutile. |
| Annuaire des noms d'églises visible depuis `/profile` | La page « Mon profil » propose désormais à tout utilisateur authentifié la liste complète des églises de la plateforme, pour lui permettre de demander à en rejoindre une (spec 037). C'était déjà le comportement de `/no-access` pour un utilisateur sans église ; `/profile` y est aligné par cohérence plutôt que d'introduire un second mécanisme (identifiant à saisir) pour le même besoin. | Faible — noms d'églises et de ministères uniquement, aucune donnée de personne. Contredit la **justification** (pas le critère d'acceptation littéral) de la spec 036, qui présentait l'absence d'annuaire comme protégeant la confidentialité de la liste des églises pour un administrateur — voir la note ajoutée à `specs/036-partage-bibliotheque-audio/spec.md`. | Accepté. Le mécanisme d'identifiant du partage audio (036) reste pertinent comme garde-fou contre l'erreur de destinataire, mais plus comme mesure de confidentialité de l'annuaire. |

## `workflow_dispatch` sans vérification CI (SEC-008)

Le déclencheur `workflow_dispatch` du workflow `deploy.yml` permet de lancer un déploiement en spécifiant une version sans vérifier que le SHA cible a passé la CI. Le chemin normal (`workflow_run` déclenché automatiquement après CI verte sur un tag `v*`) est lui protégé.

**Risque accepté** : seuls les mainteneurs disposant d'un accès en écriture au dépôt peuvent déclencher `workflow_dispatch`. C'est intentionnellement une trappe d'urgence (hotfix hors cycle normal). Le step `Check tag matches package.json` garantit que la version déclarée correspond au code checké. La surface d'attaque externe est nulle.

**Conditions de réévaluation** : si le dépôt passe en organisation avec des contributeurs extérieurs disposant du rôle `write`, ajouter une vérification du statut CI du SHA via `gh api repos/{owner}/{repo}/commits/{sha}/check-runs`.

## Tickets de suivi

- **SEC-001** : Migrer next-auth beta → stable (v5 stable ou équivalent)
- **SEC-002** : ~~`npm audit fix` pour dompurify~~ — clos (3.4.16, 2026-10-03)
- **SEC-003** : Ajouter tests P0-1 pour `media-projects/[id]/share`
- **SEC-004** : Audit trail validateur media (tokenId, timestamp, statut précédent) — HIGH-2 partiel
- **SEC-005** : ~~Mettre à jour hono / @hono/node-server via mise à jour Prisma~~ — clos (plus signalé)
- **SEC-006** : ~~Corriger fast-uri (high)~~ — clos (plus signalé)
- **SEC-007** : ~~Mettre à jour postcss via upgrade next~~ — clos (plus signalé)
- **SEC-008** : `workflow_dispatch` sans vérification CI — risque accepté (mainteneurs uniquement), réévaluer si accès write élargi
