# Constitution — Koinonia

Principes **non-négociables** qui encadrent toute spécification, tout plan et toute
implémentation. Les slash commands `/specify`, `/plan`, `/tasks`, `/implement` doivent
respecter cette constitution. En cas de conflit entre une spec et la constitution,
la constitution l'emporte.

> Cette constitution complète `CLAUDE.md` (conventions détaillées). Elle en extrait
> ce qui est **invariant** : ce qui ne doit jamais être violé sans discussion explicite.

## I. Architecture modulaire

- `src/app/` n'importe un module **que via son index** (`@/modules/X`) — jamais de chemin interne.
- La logique métier vit dans `src/modules/X/services/`, pas dans les route handlers.
- Toute nouvelle dépendance entre modules doit passer `npm run lint:boundaries`.
- L'infrastructure (`src/core/`) reste framework-agnostic.

## II. Sécurité par défaut

- **Toute route API** est protégée par `requireAuth()` ou `requirePermission(...)`.
- Multi-tenant strict : chaque donnée est rattachée à une église via `churchId` ; jamais de fuite cross-tenant.
- Les permissions viennent de `rolePermissions` (`@/lib/registry`) — **jamais** de `hasPermission` (déprécié).
- Les mutations (POST/PUT/PATCH) valident leur body avec **Zod** avant tout accès BDD.

## III. Contrats de données

- Tout changement de schéma passe par une **migration Prisma** (`prisma migrate dev`), jamais `db push`.
- Les types enum viennent de `@/generated/prisma/client` (pas `@prisma/client`).
- Les erreurs métier utilisent `ApiError(status, message)` ; les réponses passent par `successResponse` / `errorResponse`.

## IV. Conventions Next.js 16 / React 19

- Route handlers : **toujours** `const { id } = await params` (params est une Promise).
- Server Components par défaut ; `"use client"` réservé aux interactions/formulaires.
- Réutiliser les composants de `src/components/ui/` avant d'en créer.

## V. Qualité et livraison

- Avant toute PR : `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test` doivent passer.
- Jamais de push direct sur `main`. Branches `feat/<nom>`, `fix/<nom>`, `chore/<nom>`.
- Les features longues suivent la stratégie multi-PR : branche `feat/X` de base, sous-PRs vers `feat/X`, une seule PR finale vers `main`.
- Pas de sur-ingénierie : le minimum nécessaire pour la fonctionnalité spécifiée.

## VI. Traçabilité spec-driven

- Toute feature non triviale commence par une **spec** (`/specify`) avant tout code.
- Le flux est : `spec.md` (quoi/pourquoi) → `plan.md` (comment) → `tasks.md` (découpage) → implémentation.
- La spec décrit le **comportement observable** et les critères d'acceptation, pas la technique.
- Les décisions techniques et les alternatives écartées sont consignées dans `plan.md`.

---

*Modifier cette constitution est un acte délibéré : toute évolution doit être discutée
et reflétée dans `CLAUDE.md` si elle touche les conventions de code.*
