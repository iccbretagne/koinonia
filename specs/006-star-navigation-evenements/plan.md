# Plan technique — Recentrage de l'espace STAR & agenda hebdomadaire

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-05

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : la nouvelle page importe `@/lib/prisma`, `@/lib/auth`, `@/lib/registry` — aucun chemin interne de module.
- [x] **Sécurité** : nouvelle page protégée par `requireChurchPermission("planning:view")` ; périmètre requests re-gaté sur `members:view` ; multi-tenant `churchId` respecté partout.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — réutilisation de `members:view`, aucune nouvelle permission.
- [x] **Validation** Zod : aucune nouvelle mutation → rien à valider (la vue hebdo est en lecture seule, les gardes modifiées ne changent pas les corps de requête).
- [x] **Migration** Prisma : aucun changement de schéma.
- [x] **Enums** depuis `@/generated/prisma/client` : non nécessaire (aucun enum manipulé).
- [x] **UI** : réutilisation du style de cartes de `MyPlanningView` et des composants `src/components/ui/`.

## Approche générale

Deux axes indépendants :

1. **Recentrage d'accès** (navigation + gardes de routes) : masquer « Mes demandes » et « Réservation de salles » pour le STAR « pur », en re-gatant le périmètre requests/annonces sur une permission de gestion et en conditionnant le lien MRBS.
2. **Nouvelle vue hebdomadaire** : une page **Server Component** en lecture seule listant les événements de l'église pour une semaine, avec navigation semaine précédente/suivante via un paramètre d'URL. **Aucun** nouvel endpoint, **aucun** schéma, **aucune** permission créée.

## Modèle de données

**[Aucun changement]**

> Note : le modèle `Event` ne possède **pas de champ lieu**. La vue hebdomadaire affiche donc **intitulé, date, horaire (extrait de `date`) et type**. Les occurrences récurrentes sont supposées matérialisées en lignes `Event` distinctes (une par date) ; une requête par plage de dates suffit — à confirmer à l'implémentation.

## API

**Aucun nouvel endpoint.** La vue hebdomadaire interroge Prisma directement côté serveur (comme `/planning`).

Re-gatage des routes existantes du périmètre « Mes demandes » (`planning:view` → `members:view`) pour réserver la section aux profils de gestion (Super Admin, Admin, Secrétaire, Ministre, Responsable de département) :

| Route / page | Avant | Après |
|---|---|---|
| Page `/requests`, `/requests/new`, `/requests/[id]/edit` | `planning:view` | `members:view` |
| `GET`/`POST` `/api/requests` | `planning:view` | `members:view` |
| `GET`/`PATCH` `/api/requests/[id]` (côté demandeur) | `planning:view` | `members:view` |
| `GET`/`POST` `/api/announcements` | `planning:view` | `members:view` |
| `GET`/`PATCH` `/api/announcements/[id]` (côté demandeur) | `planning:view` | `members:view` |
| Traitement : `/api/requests` `PATCH` (`planning:edit`), `/api/requests/[id]` (`events:manage`) | inchangé | inchangé |

> Vérifié : `GET /api/announcements` renvoie les annonces **soumises par l'utilisateur** (sauf managers) — c'est la liste « mes demandes », pas un mur public ; la fermer aux STAR est cohérent. **Action** : auditer exhaustivement tous les points `planning:view` du périmètre requests/announcements pour n'en oublier aucun.

## Services / logique métier

- Petits **helpers de dates purs** (testables), placés dans `src/lib/` :
  - `weekBounds(ref: Date): { start: Date; end: Date }` — lundi 00:00 → dimanche 23:59:59 de la semaine de `ref`.
  - `shiftWeek(mondayISO: string, delta: -1 | 1): string` — semaine précédente/suivante.
- La requête événements (church + plage) vit dans la page Server Component (pattern `/planning/page.tsx`), pas dans un module (logique de vue, non métier).

## UI / composants

- **Nouvelle page** `/(auth)/planning/events/page.tsx` (Server Component) :
  - `requireChurchPermission("planning:view", churchId)` ; `churchId` via `getCurrentChurchId(session)`.
  - `const { week } = await searchParams` (pattern Next 16 déjà utilisé) ; `week` = ISO du lundi cible, absent = semaine courante.
  - `prisma.event.findMany({ where: { churchId, date: { gte: start, lte: end } }, orderBy: { date: "asc" }, select: { id, title, type, date } })`.
  - Rendu : en-tête de semaine + liste de cartes (réemploi du style `MyPlanningView`), état vide explicite, liens **précédent/suivant** (`?week=<lundi>`) en `<Link>` — **navigation serveur, aucun composant client requis**.
- **Navigation** (`src/app/(auth)/layout.tsx` + `Sidebar.tsx` + `BottomNav.tsx`) :
  - « Mes demandes » : condition `planning:view` → **`members:view`**.
  - « Réservation de salles » (`mrbsUrl`) : masqué si l'utilisateur est **STAR-only** (rôles de l'église courante ⊆ `{STAR}`, hors super admin/pastoral) ; conservé pour tous les autres rôles.
  - Nouvelle entrée **« Événements »** → `/planning/events`, affichée si `planning:view && !events:view` (correspond exactement au rôle STAR ; les gestionnaires gardent leur section Événements existante, pas de doublon).
  - Répercuter l'entrée « Événements » et le masquage dans `BottomNav` de façon cohérente.

### Cohabitation des deux entrées « Événements » (pas d'overlap)

Les deux entrées branchent sur `events:view` en opposition, donc **mutuellement exclusives** — aucun utilisateur ne voit les deux :

| Entrée | Condition | Destination |
|---|---|---|
| « Événements » existante (Liste/Calendrier) | `events:view` | `/events` |
| « Événements » STAR (hebdo) | `planning:view && !events:view` | `/planning/events` |

- `planning:view && !events:view` = **exactement le rôle STAR** (tout autre rôle avec `planning:view` — Ministre, Resp. dépt, Secrétaire, Admin — a aussi `events:view`).
- **Multi-rôles (ex. Responsable de département + STAR)** : les permissions sont l'**union** des rôles ; `events:view` (du rôle de gestion) est présent → l'utilisateur voit l'entrée existante (Liste/Calendrier, sur-ensemble incluant déjà l'agenda de la semaine) et **pas** l'entrée hebdo. Résolution automatique, sans condition spéciale.

### Correction BottomNav (bug latent)

Aujourd'hui `BottomNav.tsx:114` affiche « Événements » → `/events` **sans condition** : un STAR sur mobile voit une entrée pointant vers une page interdite (`events:view`). **Action** : rendre la destination conditionnelle — `/events` si `events:view`, sinon `/planning/events` — ce qui répare ce comportement au passage. Le label « Événements » reste unique et cohérent puisqu'un utilisateur donné n'a qu'une seule des deux cibles.

## Décisions & alternatives écartées

- **Choix** : réutiliser `members:view` pour gater le périmètre « Mes demandes » — *Pourquoi* : son ensemble de rôles est **exactement** les 5 profils de gestion visés, zéro nouvelle permission.
  **Écarté** : créer `requests:view` — *Raison* : sur-ingénierie (impacterait la map dépréciée `permissions.ts`, les tests de parité et la table des permissions de `CLAUDE.md`) pour un gain sémantique marginal.
- **Choix** : page Server Component + navigation par `searchParams (?week=)` — *Pourquoi* : pas d'endpoint ni de JS client, requête bornée à une semaine (légère).
  **Écarté** : charger tous les événements puis filtrer côté client (comme `MyPlanningView` pour les mois) — *Raison* : volumétrie non bornée en navigation multi-semaines.
- **Choix** : entrée « Événements » conditionnée par `planning:view && !events:view` — *Pourquoi* : cible pile le STAR, évite un doublon avec la section des gestionnaires.
- **Choix** : MRBS masqué pour STAR-only — *Pourquoi* : décision produit « uniquement pour les STAR » (conservé pour Reporter, FD, Comptable, etc.).
  **Écarté** : gater MRBS par `members:view` — *Raison* : retirerait aussi le lien à Reporter/FD/Comptable, non demandé.
- **Résolution des `[À CLARIFIER]`** : semaine **lundi→dimanche** ; **pas de lieu** (champ inexistant) ; navigation **illimitée**.

## Risques & points d'attention

- **Exhaustivité du re-gatage** requests/annonces : ne laisser aucun point `planning:view` ouvert qui permettrait à un STAR d'atteindre la section en accès direct.
- **Tests existants** requests/annonces utilisant une session STAR (`planning:view`) : à mettre à jour vers `members:view`.
- **Détection STAR-only** (MRBS) : bien gérer multi-rôles, super admin et profils pastoraux.
- **Deux points de navigation** (Sidebar + BottomNav) à garder synchronisés.
- **Récurrences** : confirmer que les occurrences sont des lignes `Event` distinctes (sinon, expansion à prévoir — hors périmètre a priori).

## Stratégie de tests

- **Helpers de dates** (`weekBounds`, `shiftWeek`) : tests unitaires purs (bornes lundi/dimanche, passage de mois/année, précédent/suivant).
- **Gardes requests/annonces** : un STAR (`planning:view`, sans `members:view`) reçoit **403** sur `GET`/`POST` `/api/requests` et `/api/announcements` ; un profil de gestion (`members:view`) passe. Mise à jour des tests de sécurité existants + ajout du cas STAR interdit.
- **Vue hebdomadaire** : test de la fonction de calcul de plage + du filtre de requête (church + plage) extrait en fonction pure ; vérification que le filtre `churchId` est toujours présent (non-fuite multi-tenant).
- Suite complète verte : `typecheck && lint && lint:boundaries && test`.
