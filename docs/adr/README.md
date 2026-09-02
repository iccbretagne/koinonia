# Architecture Decision Records (ADR)

Ce dossier trace les décisions **architecturales et structurantes** de Koinonia :
celles qui sont difficiles à revenir en arrière, qui touchent plusieurs modules
ou l'ensemble du projet, ou qui engagent un choix de stack/pattern durable.

## ADR vs. `plan.md`

Ne pas confondre avec la section "Décisions & alternatives écartées" de
`specs/NNN-nom/plan.md` :

| | `plan.md` § Décisions | ADR (`docs/adr/`) |
|---|---|---|
| Portée | Une feature | Le projet / plusieurs modules |
| Durée de vie | Liée à la feature | Durable, référencée par tout le code futur |
| Exemple | "Pourquoi ce champ est optionnel plutôt qu'un enum" | "Pourquoi une architecture modulaire en monolithe" |

Règle pratique : si la décision serait toujours vraie et pertinente même si la
feature qui l'a motivée était totalement réécrite, c'est un ADR.

## Format

Un ADR par fichier, numéroté `NNNN-titre-court.md`, voir `template.md`.
Statuts possibles : `Proposé`, `Accepté`, `Rejeté`, `Déprécié`, `Remplacé par ADR-NNNN`.

## Index

| ADR | Titre | Statut |
|---|---|---|
| [0001](0001-architecture-modulaire-monolithe.md) | Architecture modulaire en monolithe (registry + event bus) | Accepté |
| [0002](0002-multi-tenant-church-id.md) | Multi-tenant par `churchId` sur chaque donnée | Accepté |
| [0003](0003-prisma7-esm-driver-adapter.md) | Prisma 7 ESM-only avec driver adapter MariaDB | Accepté |
| [0004](0004-import-dynamique-anti-cycle-registry.md) | Import dynamique comme échappatoire au cycle `registry.ts` ↔ modules | Accepté |
| [0005](0005-module-audio-distinct.md) | Module `audio` distinct de `media` | Proposé |
| [0006](0006-extraction-module-storage.md) | Extraction de `modules/storage` hors de `media` | Proposé |
| [0007](0007-worker-hors-nextjs-table-jobs.md) | Worker hors Next.js, piloté par une table de jobs | Proposé |
| [0008](0008-cache-disque-renditions-audio.md) | Cache disque local des renditions audio, servies par l'application | Accepté |
| [0009](0009-garde-perimetre-explicite.md) | Garde de périmètre explicite au point d'entrée | Accepté |
| [0010](0010-acces-transverse-inter-eglises.md) | Accès transverse inter-églises borné au module demandeur | Accepté |

## Note sur les ADR 0001–0003

Ces trois décisions étaient déjà en place avant l'introduction de cette
pratique ADR (2026-08-23) — elles sont documentées **rétroactivement**, à
partir de l'état actuel du code et de `docs/architecture.md`/`CLAUDE.md`.
Le contexte historique exact (alternatives réellement évaluées à l'époque,
contraintes du moment) n'est pas garanti complet : elles décrivent fidèlement
*la décision telle qu'elle existe aujourd'hui* et son raisonnement tel qu'il
est inférable du code et de la documentation existante, pas nécessairement
le débat original. L'ADR 0004 est la première rédigée à chaud (issue #446).
