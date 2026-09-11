# Plan technique — Événements d'équipe

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout passe par `@/modules/planning` (nouveau service exporté par l'index)
- [x] **Sécurité** : routes protégées par `requireChurchPermission(perm, churchId)` + `requireDepartmentAccess` (ADR-0009) ; `churchId` résolu depuis la ressource (`resolveChurchId`), jamais depuis le client
- [x] **Permissions** via `rolePermissions` — réutilisation de `planning:department` / `planning:edit`, **aucune nouvelle permission**
- [x] **Validation** Zod sur POST/PUT (dont `endsAt > startsAt`)
- [x] **Migration** Prisma `add_team_events` (pas de `db push`)
- [x] **Enums** : aucun enum Prisma nouveau (fréquence stockée en `String`, comme `Event.recurrenceRule`)
- [x] **UI** : `Modal`, `Button`, `Input`, `Select` de `src/components/ui/` réutilisés
- [x] **ADR** : la visibilité par appartenance est une décision structurante → **ADR-0013** (créé avec ce plan)

## Approche générale

Un **modèle dédié** `TeamEvent`, séparé de `Event`, rattaché à un département et à une église.
Les événements d'église restent intacts : aucune requête existante (listes, calendrier, agenda
hebdomadaire, planning, comptes rendus, statistiques) n'a besoin d'un filtre supplémentaire, les
événements d'équipe y sont **absents par construction**.

Deux chemins d'accès, deux périmètres :

1. **Gestion et consultation par département** (onglet « Équipe » du tableau de bord `/dashboard`) —
   périmètre de **responsabilité**, exactement le motif des consignes de département
   (`/api/departments/[departmentId]/notices`) : `planning:department` pour lire, `planning:edit`
   pour écrire, `requireDepartmentAccess` dans les deux cas.
2. **Agenda personnel** (« Mon planning ») — périmètre d'**appartenance** : la page serveur résout
   la fiche membre liée au compte, puis lit les événements d'équipe des départements de cette fiche.
   Lecture seule, jamais exposée par une route qui accepterait un `departmentId` ou un `memberId`
   venant du client (ADR-0013).

Toute la logique Prisma vit dans `src/modules/planning/services/team-event.service.ts` : les
nouvelles routes n'importent pas `@/lib/prisma`, le cliquet `prisma-boundary-baseline.txt` reste à
153 (roadmap modularité).

## Modèle de données

```prisma
/// Rendez-vous interne à un département (spec 044). Distinct de `Event` : ne porte ni planning
/// de service, ni compte rendu, ni audio, ni médias, ni salles.
model TeamEvent {
  id             String   @id @default(cuid())
  churchId       String
  departmentId   String
  title          String   @db.VarChar(200)
  startsAt       DateTime
  endsAt         DateTime
  location       String?  @db.VarChar(200)
  description    String?  @db.Text
  recurrenceRule String?  // "weekly" | "biweekly" | "monthly" — mêmes valeurs que Event
  seriesId       String?  // partagé par toutes les occurrences d'une série (1re occurrence incluse)
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  church     Church     @relation(fields: [churchId], references: [id])
  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  createdBy  User       @relation("TeamEventCreatedBy", fields: [createdById], references: [id])

  @@index([churchId])
  @@index([departmentId, startsAt])
  @@index([seriesId])
  @@map("team_events")
}
```

Relations inverses : `Church.teamEvents`, `Department.teamEvents`,
`User.teamEventsCreated @relation("TeamEventCreatedBy")`. Mock : `teamEvent: createModelMock()`
dans `src/__mocks__/prisma.ts`.

- `onDelete: Cascade` sur le département : la suppression d'un département
  (`prisma.department.delete` direct dans `DELETE /api/departments/[departmentId]`) emporte ses
  événements d'équipe, conformément à la spec, sans toucher à cette route.
- **Série à `seriesId` plat** (toutes les occurrences, la première comprise, portent le même
  `seriesId` = id de la première) plutôt que le couple `isRecurrenceParent`/`seriesId` des
  événements d'église : « cette occurrence et les suivantes » devient une seule condition
  `seriesId = X AND startsAt >= occurrence.startsAt`, sans cas particulier pour le parent.

## API

| Endpoint | Méthode | Permission + garde | Entrée | Sortie |
|---|---|---|---|---|
| `/api/departments/[departmentId]/team-events` | GET | `planning:department` + `requireDepartmentAccess` | `?period=upcoming\|past` (défaut `upcoming`) | `TeamEventDTO[]` |
| `/api/departments/[departmentId]/team-events` | POST | `planning:edit` + `requireDepartmentAccess` | `createSchema` | `{ created: number, truncated: boolean }` (201) |
| `/api/team-events/[teamEventId]` | PUT | `planning:edit` + `requireDepartmentAccess(departmentId de l'événement)` | `updateSchema` | `{ updated: number }` |
| `/api/team-events/[teamEventId]` | DELETE | idem | `?scope=occurrence\|following` (défaut `occurrence`) | `{ deleted: number }` |

Schémas Zod :

```ts
const fields = {
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
};
const createSchema = z.object({
  ...fields,
  recurrence: z.object({
    rule: z.enum(["weekly", "biweekly", "monthly"]),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).nullable().optional(),
}).refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
  message: "L'heure de fin doit être postérieure à l'heure de début", path: ["endsAt"],
});
const updateSchema = z.object({ ...fields, scope: z.enum(["occurrence", "following"]).default("occurrence") })
  .refine(/* même contrôle endsAt > startsAt */);
```

- `resolveChurchId` gagne un type `"teamEvent"` (404 « Événement d'équipe introuvable »).
- Sur `/api/team-events/[teamEventId]`, la route résout d'abord l'église, vérifie `planning:edit`,
  puis récupère le `departmentId` de l'événement via le service **avant** `requireDepartmentAccess`
  — la ressource est désignée par son id, jamais par un `departmentId` fourni par le client.
- Surface HTTP (ADR-0012) : ajouter `{ path: "/api/team-events" }` au `routes.api` du manifeste
  `planning`. `/api/departments/...`, `/dashboard` et `/planning` sont déjà couverts.
- `logAudit` sur création/modification/suppression (`entityType: "TeamEvent"`, `details` :
  `scope`, nombre d'occurrences touchées).

**Matrice des droits obtenue** (sans modifier `rolePermissions`) :

| Rôle | `planning:department` | `planning:edit` | Périmètre | Résultat |
|---|---|---|---|---|
| Super Admin / Admin / Secrétaire | ✔ | Admin ✔ / Secrétaire ✘ | non restreint | Admin gère tout ; Secrétaire lit tout |
| Ministre | ✔ | ✔ | départements de son ministère (chargés dans la session) | gère son ministère |
| Resp. département (titulaire/adjoint) | ✔ | ✔ | ses `user_departments` | gère ses départements |
| STAR et autres | ✘ | ✘ | — | 403 ; lecture via « Mon planning » uniquement |

## Services / logique métier

`src/modules/planning/services/team-event.service.ts` (exporté par `@/modules/planning`, mêmes
conventions que `opening-closing.service.ts` : `db?: DbClient` injectable, import différé de Prisma) :

- `listDepartmentTeamEvents(departmentId, period)` — tri `startsAt` asc (à venir) / desc (passés).
- `createTeamEvent({ churchId, departmentId, userId, input })` — transaction : crée la 1re
  occurrence ; si récurrence, génère les dates suivantes, fixe `seriesId = première.id` et
  `createMany` le reste en conservant la **durée** (`endsAt - startsAt`). Retourne
  `{ created, truncated }`.
- `getTeamEventScopeInfo(id)` — `{ churchId, departmentId, startsAt, seriesId }` pour les gardes.
- `updateTeamEvent(id, input, scope)` — `occurrence` : met à jour cette ligne (elle reste dans la
  série). `following` : pour chaque occurrence `seriesId = X AND startsAt >= courante.startsAt`,
  applique titre/lieu/description, **garde son jour** et reçoit la nouvelle heure de début et la
  nouvelle durée (même approche en heure locale que `PUT /api/events/[eventId]` avec
  `applyToSeries`). Une occurrence hors série ignore `following`.
- `deleteTeamEvent(id, scope)` — `occurrence` ou `following` (mêmes bornes, occurrences passées
  jamais touchées).
- `listTeamEventsForMember(churchId, memberId)` — **seul point d'entrée du périmètre
  d'appartenance** : `where: { churchId, department: { memberDepts: { some: { memberId } } } }`.
  Calculé à la lecture, donc un retrait du département est effectif immédiatement.

Extraction : `generateRecurrenceDates` et `MAX_RECURRENCE_OCCURRENCES` (104) quittent
`request-executor.ts` pour `src/modules/planning/services/recurrence.ts`, importé par
`request-executor.ts` et le nouveau service. Les copies de `api/events/route.ts` et du module
`rooms` ne sont **pas** touchées (hors périmètre, dette notée).

Pas d'événement sur `planningBus`, pas de notification (hors périmètre).

## UI / composants

**Gestion — onglet « Équipe » du tableau de bord** (`/dashboard?dept=…&view=team`)

- `DashboardActions.tsx` : 5e lien « Équipe » (même style, `flex-wrap` déjà en place pour le mobile).
- `dashboard/page.tsx` : branche `view === "team"` ; `selectedDepartment` étendu à `"team"` ;
  passe `canEditPlanning` (déjà calculé) au composant.
- Nouveau client `src/components/TeamEventsView.tsx` :
  - bascule « À venir / Passés » ; liste de cartes (titre, date, `HH:MM–HH:MM`, lieu, pictogramme
    ↻ si série) ;
  - si `canEditPlanning` : bouton « Nouvel événement d'équipe » + actions modifier/supprimer ;
    sinon lecture seule (Secrétaire) ;
  - `Modal` de création/édition : `Input` titre, date, heure début/fin, lieu, `textarea`
    description ; à la création, `Select` récurrence (Aucune/Hebdomadaire/Bi-hebdomadaire/Mensuel)
    + date de fin ;
  - pour une occurrence de série, la modale d'édition et la confirmation de suppression proposent
    « Cette occurrence uniquement » / « Cette occurrence et les suivantes » (libellés alignés sur
    `EventDetailClient.tsx`) ;
  - message si `truncated` (plafond de 104 occurrences) ; erreurs Zod affichées sous le champ.
- Mobile : cartes empilées, modale plein écran existante de `Modal`, boutons pleine largeur sous
  `sm`.

**Consultation — « Mon planning »** (`/planning`)

- `planning/page.tsx` : ajoute `listTeamEventsForMember(churchId, link.memberId)` au
  `Promise.all` existant et le passe en nouvelle prop `teamEvents`.
- `MyPlanningView.tsx` : fusionne services et événements d'équipe par mois (tri par date) ;
  entrée d'équipe distinguée par un badge **« Équipe »** (contour violet, à la place du badge de
  statut de service), le nom du département, la plage horaire et le lieu. `minKey`/`maxKey` et
  l'état vide tiennent compte des deux listes (« Aucun service ni événement d'équipe »).

Aucun nouveau lien de menu : le Responsable/Ministre/Secrétaire passe par « Planning » ; le
membre par « Mon planning ».

## Décisions & alternatives écartées

- **Choix** : modèle dédié `TeamEvent`. — *Pourquoi* : isolation par construction ; `Event` porte
  une dizaine de relations (planning, rapports, audio, salles, médias, annonces) sans objet ici, et
  chaque requête d'événements existante aurait dû filtrer une portée — une seule omission = fuite.
- **Écarté** : champ `scope: CHURCH | DEPARTMENT` sur `Event`. — *Raison* : ci-dessus ; en plus,
  migration de toutes les requêtes et tests existants.
- **Choix** : réutiliser `planning:department` (lecture) / `planning:edit` (gestion) +
  `requireDepartmentAccess`. — *Pourquoi* : ces deux permissions désignent **exactement** les
  ensembles de rôles voulus par la spec (Secrétaire en lecture seule inclus), et le motif est déjà
  éprouvé sur les consignes de département. Aucune modification de matrice.
- **Écarté** : nouvelles permissions `team-events:view/manage` (suggérées dans l'issue). —
  *Raison* : dupliqueraient à l'identique les ensembles de rôles de `planning:department` /
  `planning:edit` ; la lisibilité recherchée est obtenue par la garde de périmètre, pas par un
  nouveau nom. La lecture par les membres, elle, ne peut **pas** s'exprimer en permission de rôle
  (elle dépend de l'appartenance, pas du rôle) — cf. ADR-0013.
- **Choix** : visibilité membre via un service serveur prenant le `memberId` **résolu depuis la
  session** (ADR-0013). — *Pourquoi* : aucune surface API nouvelle à protéger pour le STAR ; pas de
  modification de `getUserDepartmentScope` (décision spec 031/ADR-0009 préservée).
- **Écarté** : donner au STAR un périmètre de département fondé sur ses `member_departments`. —
  *Raison* : rouvrirait toutes les routes de département au STAR (écarté par la spec 031).
- **Choix** : série à `seriesId` plat. — *Pourquoi* : « cette occurrence et les suivantes » en une
  requête. **Écarté** : copier le schéma parent/enfants de `Event` — complexité sans bénéfice ici.
- **Choix** : gestion dans un onglet du tableau de bord. — *Pourquoi* : sélecteur de département
  et contrôle `planning:department` déjà en place, pas de nouvel item de menu (spec 043 : menu à ne
  pas rallonger). **Écarté** : page `/team-events` dédiée.

## Risques & points d'attention

- **Garde oubliée sur `/api/team-events/[teamEventId]`** (ressource désignée par id) : la route doit
  résoudre le département de l'événement avant `requireDepartmentAccess`. Couvert par des tests
  « hors périmètre → 403 » sur PUT et DELETE (exigence ADR-0009).
- **Fuseau horaire / heure d'été** lors du report d'heure sur « les suivantes » : même méthode en
  heure locale que les événements d'église ; test sur une série traversant le changement d'heure.
- **Plafond de 104 occurrences** : signalé à l'utilisateur via `truncated`.
- **« Cette occurrence et les suivantes » écrase une occurrence modifiée individuellement** :
  comportement identique aux événements d'église, assumé.
- **Ministre** : son périmètre repose sur les départements de son ministère chargés à la
  connexion ; un département créé ensuite n'y apparaît qu'à la session suivante (comportement
  existant pour toutes les routes de département).
- **Cliquet Prisma** : garder toute requête dans le service ; si une route importe `@/lib/prisma`,
  le CI casse (seuil 153).

## Stratégie de tests

- **Service** (`team-event.service.test.ts`, mock Prisma) : génération d'une série (durée
  conservée, `seriesId` commun, `truncated`) ; `following` ne touche que `startsAt >=` courante et
  la même série ; `occurrence` ne touche qu'une ligne ; report d'heure sur une série traversant le
  passage à l'heure d'été ; `listTeamEventsForMember` filtre par `churchId` **et** appartenance.
- **Routes département** (`team-events/__tests__/dept-scope.test.ts`, motif `notices`) :
  Resp. hors périmètre → 403 (GET, POST) ; Resp. dans son périmètre → 200/201 ; Ministre dans /
  hors de son ministère ; STAR → 403 ; Secrétaire GET → 200, POST → 403 ; Admin → 200/201 ;
  `endsAt <= startsAt` → 400.
- **Routes événement** (`api/team-events/[teamEventId]/__tests__/route.test.ts`) : PUT/DELETE hors
  périmètre → 403 ; événement d'une autre église → 404/403 ; `scope=following` transmis au service.
- **Recurrence** : les tests existants de `request-executor` passent inchangés après extraction.
- **Surface HTTP** : `routes-exhaustivite.test.ts` passe avec la déclaration `/api/team-events`.
- **Isolation des événements d'église** : garantie structurelle (modèle séparé), aucun test
  spécifique ajouté sur les requêtes existantes.
- **Manuel (recette)** : création/édition/suppression de série sur mobile et desktop ; affichage
  dans « Mon planning » d'un STAR membre, absence pour un STAR d'un autre département.

## Documentation à mettre à jour

`CLAUDE.md` (section rôles : ligne sur les événements d'équipe, sans changement de matrice),
`docs/auth.md` (périmètre d'appartenance, renvoi ADR-0013), `docs/api.md` (4 endpoints),
`docs/database.md` (`TeamEvent`), `docs/adr/README.md` (ADR-0013).
