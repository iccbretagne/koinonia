# ADR-0001 — Architecture modulaire en monolithe (registry + event bus)

- **Statut** : Accepté
- **Date** : 2026-08-23 *(rédigé rétroactivement — voir `README.md`)*

## Contexte

Koinonia est déployé comme une seule application, mais couvre des domaines
métier distincts (planning/évènements, discipolat, médias, comptabilité,
intégration, agenda, jobs...). Sans frontières explicites, un monolithe tend
à accumuler des dépendances croisées non maîtrisées entre domaines, rendant
le code de plus en plus difficile à faire évoluer isolément.

## Décision

Koinonia adopte un **monolithe modulaire** : une seule base de code et un
seul déploiement, mais organisée en modules (`src/modules/X/`) avec des
frontières strictes, enforced en CI :

- Chaque module expose un **manifeste** (`index.ts` via `defineModule()`)
  déclarant ses `permissions` (map permission → rôles autorisés) et sa
  `navigation`.
- `src/core/module-registry.ts` fournit `ModuleRegistry` (enregistrement,
  validation des dépendances, ordre de chargement) et `buildRolePermissions()`
  dérive la matrice rôles→permissions à partir des manifestes.
- `src/core/event-bus.ts` fournit un `EventBus<TEvents>` typé et
  **transaction-aware** (les handlers s'exécutent dans le même
  `Prisma.TransactionClient` que l'émetteur ; un throw dans un handler
  rollback la transaction) pour la communication cross-module.
- `src/app/` ne peut importer un module que via son point d'entrée public
  (`index.ts` ou `auth.ts`), jamais un chemin interne — règle
  `app-only-module-public-api` dans `.dependency-cruiser.cjs`.
- Un module ne peut pas importer directement un autre module (une règle
  dédiée par module dans `.dependency-cruiser.cjs`) — toute communication
  cross-module passe par l'event bus ou par `src/core`/`src/lib` partagés.
- `src/core/` reste framework-agnostic et ne dépend d'aucun module
  applicatif (règle `core-no-modules-import`).

Ces règles sont vérifiées automatiquement (`npm run lint:boundaries`, CI).

## Alternatives considérées

- **Microservices** — *Écarté* : complexité opérationnelle (déploiement,
  observabilité, transactions distribuées) disproportionnée pour la taille
  de l'équipe et le volume de trafic d'une association/église.
- **Monolithe sans frontières internes formalisées** (juste une convention
  de dossiers) — *Écarté* : sans enforcement CI, les frontières se dégradent
  naturellement avec le temps (constat empirique du projet : c'est
  exactement ce qui a motivé la règle ajoutée en ADR-0004 après l'issue #446).

## Conséquences

- **Positif** : un domaine métier peut évoluer, être testé et raisonné
  isolément ; la matrice de permissions est dérivée automatiquement des
  manifestes plutôt que maintenue à la main ; `lint:boundaries` détecte
  immédiatement une violation de frontière en CI, avant le build.
- **Positif** : le bus d'événements transaction-aware permet des effets de
  bord cross-module (notifications, création d'entités liées) sans coupler
  directement les modules entre eux.
- **Négatif / contrainte** : ajoute un formalisme (manifeste, event bus) même
  pour des interactions simples entre deux modules ; toute nouvelle
  dépendance entre modules doit être justifiée et passer `lint:boundaries`.
- **Négatif / risque connu** : le point de composition (`src/lib/registry.ts`,
  qui importe tous les modules pour calculer `rolePermissions`) est un point
  de cycle potentiel si un module l'importe en retour statiquement — voir
  ADR-0004 pour la règle qui mitige ce risque.

## Références

- `docs/architecture.md` (description détaillée à jour)
- `.dependency-cruiser.cjs` (règles enforced)
- `specs/constitution.md` § I (Architecture modulaire)
