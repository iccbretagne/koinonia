# Plan technique — Périmètres d'accès

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module ; les permissions ajoutées
      sont déclarées dans les manifestes (`src/modules/planning/index.ts`, `src/modules/core/index.ts`)
      et consommées via `rolePermissions` de `@/lib/registry`.
- [x] **Sécurité** : toutes les routes touchées conservent `requireChurchPermission` ; le
      périmètre s'y **ajoute**, il ne s'y substitue pas. `resolveChurchId` reste la source
      d'autorité de l'église.
- [x] **Permissions** via `rolePermissions` — deux permissions nouvelles, aucune régression du
      mécanisme.
- [x] **Validation** Zod : inchangée, aucune nouvelle mutation.
- [x] **Migration** Prisma : **aucun changement de schéma** — voir § Modèle de données.
- [x] **Enums** depuis `@/generated/prisma/client` : aucun nouvel enum.
- [x] **UI** : aucun composant créé ; seuls des filtres et des gardes sont ajoutés.

## Approche générale

Le fil directeur tient en une phrase : **le périmètre doit être une garde explicite au point
d'entrée, jamais une propriété implicite du filtrage des données.**

Trois leviers, du plus général au plus local :

1. **Un helper de garde unique** — `requireDepartmentAccess(session, churchId, departmentId)` —
   qui remplace les cinq lignes recopiées à la main dans la seule route qui applique
   aujourd'hui le périmètre. C'est ce helper que l'on applique aux 8 accès manquants. Le
   contrôle devient une ligne, ce qui est la condition pour qu'il soit systématiquement écrit.
2. **Deux permissions nouvelles** pour dire dans le modèle de rôles ce qui est aujourd'hui
   implicite : `planning:department` (la grille par département, refusée au STAR) et
   `access:manage` (la gestion des accès, aujourd'hui gardée par deux permissions différentes).
3. **Un filtrage de requête corrigé** pour la fuite inter-tenant, et un périmètre par ministère
   pour le Ministre.

Aucune migration : tout se joue dans les manifestes de modules et les gardes.

## Modèle de données

**[Aucun changement de schéma.]** Le rattachement nécessaire existe déjà, sur deux chaînes
distinctes que ce plan ne fusionne pas (décision de la spec) :

- **responsabilité** : `UserChurchRole` → `user_departments` (`isDeputy`) → `Department`,
  et `UserChurchRole.ministryId` → `Ministry` ;
- **appartenance** : `MemberUserLink` → `Member` → `member_departments` (`isPrimary`).

`getUserDepartmentScope` ne lit que la première, et continue de ne lire qu'elle.

## API

Aucun endpoint créé ou supprimé. Le tableau liste ce qui **change de garde** :

| Endpoint | Méthode | Permission avant | Permission après | Périmètre ajouté |
|---|---|---|---|---|
| `/api/departments/[departmentId]/tasks` | POST, DELETE | `planning:edit` | `planning:edit` | **département** |
| `/api/departments/[departmentId]/tasks` | GET | `planning:view` | `planning:department` | **département** |
| `/api/departments/[departmentId]/notices` | PUT, DELETE | `planning:edit` | `planning:edit` | **département** |
| `/api/departments/[departmentId]/notices` | GET | `planning:view` | `planning:department` | **département** |
| `/api/departments/[departmentId]/members` | GET | `members:view` | `members:view` | **département** |
| `/api/departments/[departmentId]/stats` | GET | `planning:view` | `planning:department` | **département** |
| `/api/departments/[departmentId]/monthly-planning` | GET | `planning:view` | `planning:department` | **département** |
| `/api/events/[eventId]/departments/[deptId]/tasks` | GET, PUT | `planning:view` / `planning:edit` | `planning:department` / `planning:edit` | **département** |
| `/api/planning/weekly` | GET | `planning:view` | `planning:department` | **département** (filtrage de la liste) |
| `/api/users/[userId]/roles` | POST, PATCH, DELETE | `events:manage` | **`access:manage`** | **ministère** (Ministre) |
| `/api/rooms`, `/api/rooms/key-holders`, `/api/room-reservations` | toutes | `rooms:view` / `rooms:reserve` | inchangées | — (le STAR perd les permissions elles-mêmes) |

`GET /api/events/[eventId]/departments/[deptId]/planning` est déjà correct : sa garde manuelle
est simplement remplacée par l'appel au helper, sans changement de comportement.

### Permissions ajoutées aux manifestes

```
# src/modules/planning/index.ts
"planning:view"        : … + STAR      (inchangée — vue personnelle, absences, agenda)
"planning:department"  : SUPER_ADMIN, ADMIN, SECRETARY, MINISTER, DEPARTMENT_HEAD   ← nouvelle, sans STAR

# src/modules/core/index.ts
"access:manage"        : SUPER_ADMIN, ADMIN, SECRETARY, MINISTER                    ← nouvelle
```

### Permissions retirées

```
# src/modules/rooms/index.ts
"rooms:view"    : retirer STAR
"rooms:reserve" : retirer STAR
```

## Services / logique métier

Deux helpers dans `src/lib/auth.ts`, aux côtés de `getUserDepartmentScope` :

- **`requireDepartmentAccess(session, churchId, departmentId)`** — ne retourne rien, jette
  `FORBIDDEN` si le périmètre est restreint et ne contient pas le département. Encapsule
  exactement la logique aujourd'hui recopiée à la main. Un périmètre restreint et **vide**
  (cas du STAR) refuse tout : c'est ce qui met en œuvre la restriction totale décidée dans la
  spec, sans code spécifique au rôle STAR.
- **`getUserMinistryScope(session, churchId)`** — symétrique de `getUserDepartmentScope` :
  `{ scoped: false }` pour Super Admin et rôles globaux (Admin, Secrétaire), sinon
  `{ scoped: true, ministryIds }` construit depuis `UserChurchRole.ministryId`. Un Ministre
  sans ministère obtient une liste vide, donc ne gère personne — conforme à la spec.

Aucun service de module n'est touché : ces helpers relèvent de l'infrastructure d'authentification,
pas d'un domaine métier.

### Anti-escalade — inchangée, mais étendue au Ministre

`PRIVILEGED_ROLES` → `isSuperAdmin` reste tel quel. On y ajoute une seconde barrière : un
appelant dont le périmètre de ministère est restreint ne peut manipuler que des rôles
**rattachables à un ministère ou à un département** (`MINISTER`, `DEPARTMENT_HEAD`, `STAR`) et
uniquement dans **ses** ministères — jamais `ADMIN`, `SECRETARY`, `REPORTER`, `ACCOUNTANT`,
`DISCIPLE_MAKER`, `AGENDA_QUALIFIER`, qui sont transverses à l'église.

## UI / composants

- **`src/app/(auth)/layout.tsx`** — `hasPlanningAccess` bascule sur `planning:department` (pilote
  l'entrée « Planning » vers `/dashboard`). `hasMyPlanning` et `showStarEvents`, qui en dépendent
  aujourd'hui, sont redéfinis sur `planning:view` : c'est la dissociation demandée par l'issue #462.
  `hasRooms` est inchangé — le STAR le perd mécaniquement en perdant `rooms:view`.
- **`src/app/(auth)/dashboard/page.tsx`** — ajout de la garde absente : la page n'exige
  aujourd'hui **qu'une session**. Elle doit exiger `planning:department` dans l'église courante.
  Corollaire (voir § Risques) : `userPermissions` y est calculé sur **toutes** les églises de
  l'utilisateur, ce qui doit être filtré sur l'église courante.
- **`src/app/(auth)/admin/access/page.tsx`** — garde alignée sur `access:manage` ; le `where: {}`
  devient un filtre sur l'appartenance à l'église courante ; pour un Ministre, restriction
  supplémentaire à son ministère. `AccessClient` reçoit les ministères déjà filtrés, plus un
  indicateur de périmètre pour masquer les rôles transverses.
- **`src/app/(auth)/rooms/**`** — aucune modification : les pages s'appuient déjà sur
  `rooms:view`, que le STAR perd.

Aucun composant de `src/components/ui/` n'est créé ni modifié.

### Filtre de la page de gestion des accès

La liste doit rester utile — elle sert aussi à traiter les **nouveaux** utilisateurs sans rôle.
Le critère d'appartenance à l'église courante est donc l'**union** de : détenir un rôle dans
l'église, y avoir un lien de membre, ou y avoir une demande de liaison (en attente ou refusée).
Un utilisateur sans aucun de ces trois rattachements n'a rien à faire dans la liste.

## Décisions & alternatives écartées

- **Choix : une permission `planning:department` distincte, plutôt que retirer `planning:view` au
  STAR.** — *Pourquoi* : `planning:view` est consommée par 20 fichiers, dont « Mon planning », les
  absences, la vue événements du STAR, la prise de RDV agenda et le mode pastoral. La retirer au
  STAR casserait tous ces parcours, que la spec exige de préserver sans régression. Introduire la
  permission fine laisse `planning:view` dans son rôle réel — « voit son propre planning » — et
  n'impacte que les accès par département.
- **Choix : une permission `access:manage` dédiée, plutôt que réutiliser `events:manage`.** —
  *Pourquoi* : la route de gestion des rôles porte aujourd'hui un commentaire expliquant qu'on
  emprunte `events:manage` parce qu'elle couvre le bon triplet de rôles. Garder un droit dont le
  nom ne décrit pas ce qu'il garde est précisément ce qui a produit le désalignement page/API.
  Une permission nommée d'après sa fonction rend l'écart impossible à reproduire.
- **Choix : un helper qui jette, plutôt qu'un helper qui retourne un booléen.** — *Pourquoi* : un
  booléen se teste ou s'oublie ; un appel qui jette est soit présent, soit absent. Il aligne le
  périmètre sur le style déjà en vigueur pour les permissions (`requireChurchPermission`).
- **Écarté : filtrer silencieusement au lieu de refuser** (renvoyer une liste vide plutôt qu'un
  403 sur un département hors périmètre). — *Raison* : sur un accès nominatif à une ressource, le
  refus est la bonne réponse. Le filtrage reste employé là où la ressource est une **liste**
  (planning hebdomadaire), où il n'y a rien à refuser.
- **Écarté : distinguer un périmètre de lecture d'un périmètre d'écriture.** — *Raison* : décision
  de la spec, qui refuse de fusionner les chaînes d'appartenance et de responsabilité. Le
  périmètre reste unique, ce qui garde le helper trivial à raisonner.
- **Écarté : un middleware appliquant le périmètre globalement.** — *Raison* : `src/proxy.ts`
  n'a pas accès au département visé sans parser les URL de chaque famille de routes, ce qui
  déplacerait la logique métier dans l'infrastructure et échouerait silencieusement sur toute
  route future de forme inattendue. La garde explicite est vérifiable route par route.

### ADR à créer

L'invariant « **tout accès nominatif à une ressource de département passe par une garde de
périmètre explicite au point d'entrée** » dépasse cette feature : il vaudra pour toute route
future, et il resterait vrai si cette feature était réécrite. C'est le critère d'ADR de
`docs/adr/README.md`. → **ADR-0009 « Garde de périmètre explicite au point d'entrée »**, à
rédiger dans la même PR, avec pour statut `Accepté`.

## Risques & points d'attention

- **Découverte pendant l'exploration, non prévue par la spec** : `dashboard/page.tsx` (ligne 38)
  et six autres pages calculent leurs permissions à partir de **toutes** les églises de
  l'utilisateur, sans filtrer sur l'église courante — un responsable de département dans
  l'église A obtient `planning:edit` en consultant l'église B. La spec 024 avait corrigé ce motif
  dans `layout.tsx` (le commentaire l'y explique) mais pas dans les pages. **On corrige
  `dashboard/page.tsx`**, directement dans le périmètre de la spec. Les six autres pages
  (`media/requests`, `secretariat/requests`, `communication/requests`, `admin/discipleship`,
  `admin/members`, `admin/events/[eventId]/report`) relèvent de modules explicitement hors
  périmètre : **à traiter par une issue de suivi**, pas à absorber ici.
- **Le Ministre gagne un pouvoir.** C'est assumé par la spec, mais c'est le seul changement du
  lot qui **élargit** des droits. À vérifier en priorité en recette, et à mentionner dans le
  corps de la PR.
- **Régression silencieuse possible sur les rôles légitimes.** Le risque principal n'est pas de
  laisser passer, c'est de bloquer : un responsable de département dont les affectations
  `user_departments` sont incomplètes en base perdra l'accès à des départements qu'il gère
  réellement. À vérifier sur les données de recette avant mise en production.
- **`planning:department` doit être ajoutée au mode pastoral** si les utilisateurs pastoraux
  accèdent aujourd'hui à `/dashboard` : le bloc qui injecte des permissions transverses dans
  `layout.tsx` ajoute `planning:view`, pas la nouvelle permission. À trancher à l'implémentation
  en vérifiant le parcours pastoral réel.
- **Le STAR perd les salles pendant qu'il a des réservations en cours.** Aucune donnée n'est
  supprimée, mais l'affichage côté gestionnaire doit tolérer un auteur qui n'a plus le droit —
  à couvrir par un test.

## Stratégie de tests

Le socle : **un fichier de test de périmètre par famille de routes**, sur le modèle de
`dept-scope.test.ts` mais au niveau de la route et non de la fonction pure (le test existant
réimplémente la logique au lieu de l'importer — on ne reproduit pas ce contournement).

- `src/lib/__tests__/scope.test.ts` — `requireDepartmentAccess` et `getUserMinistryScope` :
  périmètre non restreint (Super Admin, Admin, Secrétaire) ; restreint et contenant ; restreint
  et ne contenant pas ; **restreint et vide** (STAR) ; multi-église (un rôle global dans A ne
  donne rien dans B) ; adjoint (`isDeputy`) inclus ; cumul de rôles = union.
- `src/app/api/departments/__tests__/dept-scope.test.ts` — pour chacun des accès par département :
  un `DEPARTMENT_HEAD` hors périmètre est refusé, le même dans son périmètre est accepté, un
  `STAR` est refusé, un `ADMIN` est accepté.
- `src/app/api/users/[userId]/roles/__tests__/ministry-scope.test.ts` — un Ministre agit dans son
  ministère ; est refusé hors de son ministère ; est refusé sur un rôle transverse ; un Ministre
  sans ministère est refusé partout ; **l'anti-escalade Super Admin existante ne régresse pas**.
- `src/app/(auth)/admin/access/__tests__/tenant-scope.test.ts` — la requête de liste ne renvoie
  aucun utilisateur étranger à l'église, et renvoie bien les trois catégories de rattachement
  (rôle, lien membre, demande de liaison).
- `src/modules/planning/permissions.test.ts` et `src/modules/rooms/` — la table des permissions
  est assertée : le STAR n'a pas `planning:department`, n'a ni `rooms:view` ni `rooms:reserve`,
  et **conserve** `planning:view`. C'est le test qui empêchera une régression par simple édition
  d'un manifeste.

Les tests de non-régression déjà en place (`absences/__tests__/security.test.ts`,
`room-reservations/__tests__/security.test.ts`, `roles/__tests__/scope.test.ts`) doivent passer
sans modification autre que l'ajustement des rôles attendus.
