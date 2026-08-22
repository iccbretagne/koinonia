# ADR-0003 — Prisma 7 ESM-only avec driver adapter MariaDB

- **Statut** : Accepté
- **Date** : 2026-08-23 *(rédigé rétroactivement — voir `README.md`)*

## Contexte

Le projet utilise MariaDB comme base de données et Next.js 16 (App Router,
Turbopack) comme framework. Prisma 7 a changé son mode de fonctionnement par
rapport aux versions précédentes : le client généré est **ESM-only** et
nécessite un **driver adapter** explicite plutôt que le moteur de requête
binaire historique de Prisma.

## Décision

- Utilisation de **Prisma 7** avec l'adapter `PrismaMariaDb` de
  `@prisma/adapter-mariadb` (`src/lib/prisma.ts`, singleton via le pattern
  `globalThis` pour éviter la multiplication de connexions en hot-reload dev).
- Le client Prisma généré vit dans `src/generated/prisma/` (et non le chemin
  par défaut `node_modules/@prisma/client`) — les types enum (`Role`, etc.)
  sont importés depuis `@/generated/prisma/client`.
- La datasource URL n'est **plus** déclarée dans `schema.prisma` mais dans
  `prisma.config.ts` à la racine (nouveau mécanisme de configuration CLI de
  Prisma 7).

## Alternatives considérées

- **Rester sur Prisma 5/6 avec le moteur binaire classique** — *Écarté* :
  aurait évité la contrainte ESM-only et le driver adapter, mais aurait
  privé le projet des évolutions de Prisma 7 (accès aux dernières
  fonctionnalités, correctifs de sécurité, alignement avec l'écosystème qui
  migre vers les driver adapters comme standard).
- **Un autre ORM (Drizzle, Kysely)** — *Non documenté comme évalué* : pas de
  trace d'une évaluation formelle dans ce projet ; Prisma était déjà le choix
  en place avant l'introduction de cette pratique ADR.

## Conséquences

- **Positif** : accès aux fonctionnalités et correctifs de Prisma 7 ;
  alignement avec la direction de l'écosystème Prisma (driver adapters).
- **Négatif / contrainte** : le client Prisma étant ESM-only, toute
  incompatibilité d'un outil du toolchain avec l'ESM pur peut bloquer la
  génération ou l'exécution — point de vigilance à chaque montée de version
  de Next.js/Node.
- **Négatif / contrainte connue** : `prisma generate` peut échouer localement
  si les fichiers de `src/generated/prisma/` appartiennent à un autre
  utilisateur système (`EACCES` constaté en environnement sandbox durant
  cette session) — ce n'est pas un défaut de la décision elle-même, mais un
  point d'attention d'environnement à documenter pour l'onboarding.

## Références

- `CLAUDE.md` § Stack technique, § Points d'attention
- `prisma.config.ts`, `src/lib/prisma.ts`
- `docs/database.md`
