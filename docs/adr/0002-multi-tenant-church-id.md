# ADR-0002 — Multi-tenant par `churchId` sur chaque donnée

- **Statut** : Accepté
- **Date** : 2026-08-23 *(rédigé rétroactivement — voir `README.md`)*

## Contexte

Koinonia, bien que développé pour ICC Bretagne, est conçu pour être adaptable
à toute église structurée en ministères et départements. Plusieurs églises
(tenants) doivent pouvoir utiliser la même instance de l'application sans que
les données de l'une soient visibles ou modifiables par l'autre, et un même
utilisateur peut être rattaché à plusieurs églises avec des rôles différents
selon l'église.

## Décision

Chaque église (`Church`) est un **tenant isolé au niveau de la donnée** :

- Toute entité métier rattachée à une église porte un champ `churchId`.
- Un utilisateur (`User`) peut avoir des rôles différents dans plusieurs
  églises via `UserChurchRole`.
- Les helpers d'autorisation (`requireChurchPermission(permission, churchId)`,
  `resolveChurchId(type, resourceId)` dans `src/lib/auth.ts`) imposent la
  vérification du `churchId` à chaque accès, plutôt que de faire confiance à
  un filtrage côté client ou à une isolation par schéma de base de données
  séparé.
- L'isolement est donc **applicatif** (vérifié à chaque requête via ces
  helpers), pas structurel (pas de base de données ni de schéma séparé par
  église).

## Alternatives considérées

- **Une base de données par église (isolation physique)** — *Écarté* :
  complexité opérationnelle de provisioning/migration multipliée par le
  nombre d'églises, sans bénéfice de sécurité proportionné pour le volume de
  données concerné (associations religieuses, pas de contrainte
  réglementaire de séparation physique connue).
- **Un schéma PostgreSQL/MariaDB séparé par église** — *Écarté* : mêmes
  contraintes opérationnelles qu'une base séparée, avec en plus la
  complexité de gérer les migrations Prisma sur N schémas.

## Conséquences

- **Positif** : une seule base de données à opérer, sauvegarder, migrer ;
  ajout d'une nouvelle église = une ligne, pas un provisioning
  d'infrastructure.
- **Négatif / risque structurel** : l'isolation multi-tenant repose
  entièrement sur la discipline du code applicatif — un endpoint qui oublie
  de filtrer par `churchId` ou de vérifier la permission avec le bon
  `churchId` crée une fuite cross-tenant. C'est pourquoi la constitution du
  projet (§ II) rend ce contrôle **non-négociable** : "Multi-tenant strict :
  chaque donnée est rattachée à une église via `churchId` ; jamais de fuite
  cross-tenant."
- **Conséquence pratique** : tout nouveau modèle Prisma représentant une
  donnée propre à une église doit inclure `churchId`, et toute nouvelle route
  API doit passer par `requireChurchPermission`/`resolveChurchId` plutôt que
  de faire une vérification de permission "globale" qui ignorerait le tenant.

## Références

- `CLAUDE.md` § Multi-tenant, § Helpers d'authentification
- `src/lib/auth.ts` (`requireChurchPermission`, `resolveChurchId`)
- `specs/constitution.md` § II (Sécurité par défaut)
