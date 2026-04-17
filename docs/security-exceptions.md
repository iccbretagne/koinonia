# Exceptions sécurité acceptées — v1.0

## npm audit

| Package | Sévérité | CVE / GHSA | Raison | Plan de sortie |
|---|---|---|---|---|
| nodemailer | moderate | GHSA-… | Dépendance transitive de next-auth beta ; nodemailer@7 est requis mais @auth/core attend ^6.8.0. Aucun fix disponible sans changer next-auth. Impact runtime limité (SMTP sortant uniquement). | Résoudre avec la migration next-auth beta → stable (SEC-001). Réévaluer au 2026-07-17. |
| dompurify | moderate | — | Vulnérabilité transitive sans vecteur d'attaque identifié dans le contexte Koinonia (aucun HTML non maîtrisé sanitisé côté serveur). | Corriger via `npm audit fix` dès qu'un fix non-breaking est disponible (SEC-002). |
| hono | moderate | GHSA-458j-xx4x-4375 | Dépendance transitive de `prisma > @prisma/dev`. Non utilisé dans le code applicatif Koinonia (aucun import hono dans `src/`). La vulnérabilité concerne le rendu JSX SSR de hono, hors périmètre. | Fix disponible dans hono ≥ 4.12.14 — bloqué par la version de `@prisma/dev`. Réévaluer à la prochaine mise à jour Prisma (SEC-005). |
| @hono/node-server | moderate | GHSA-92pp-h63x-v22m | Dépendance transitive de `prisma > @prisma/dev`. Non utilisé dans le code applicatif. La vulnérabilité concerne `serveStatic` avec des slashes répétés, sans vecteur d'attaque dans Koinonia. | Fix disponible dans @hono/node-server ≥ 1.19.13 — bloqué par `@prisma/dev`. Réévaluer à la prochaine mise à jour Prisma (SEC-005). |

## npm ls (arbre invalide)

next-auth beta (v5 beta) exige nodemailer@^6.8.0 mais nodemailer@7.x est installé.
Résolu partiellement : aucune incompatibilité runtime connue. Ticket SEC-001.

## Tickets de suivi

- **SEC-001** : Migrer next-auth beta → stable (v5 stable ou équivalent)
- **SEC-002** : `npm audit fix` pour dompurify
- **SEC-003** : Ajouter tests P0-1 pour `media-projects/[id]/share`
- **SEC-004** : Audit trail validateur media (tokenId, timestamp, statut précédent) — HIGH-2 partiel
- **SEC-005** : Mettre à jour hono / @hono/node-server via mise à jour Prisma
