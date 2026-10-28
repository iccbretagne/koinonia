# Plan technique — Candidatures au service (fiche STAR)

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-10-28

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `serving`. `src/app/` l'importe via `@/modules/serving`,
  `@/modules/serving/auth` et `@/modules/serving/schemas`. Le module n'importe que `storage`
  (exception nommée, ADR-0006). Les gestes sur la fiche STAR (rattacher ou retirer d'un
  département, chercher des homonymes) restent dans `planning`. La route les **injecte** dans le
  service `serving`, qui n'importe jamais `planning`.
- [x] **Sécurité** :
  - routes authentifiées gardées par `requireServingAccess`, `requireServingSettingsAccess` et
    `requireAssignmentDecision` (`@/modules/serving/auth`), toujours avec `churchId` ;
  - pour un objet identifié, l'église qui fait foi est celle de la candidature (`resolveChurchId`) ;
  - route publique : Turnstile, champ piège et limite de débit avant tout effet de bord.
- [x] **Permissions** : `serving:manage` (Super Admin, Admin) déclarée dans le manifeste et lue
  via `rolePermissions`. L'équipe PVS passe par la fonction de département, comme
  `INTEGRATION` ou `CAPTATION_AUDIO`.
- [x] **Validation** : Zod sur toutes les mutations, schémas dans les `contract.ts`.
- [x] **Migration** Prisma : nouveaux modèles et colonne `Department.contactEmail`.
- [x] **Enums** depuis `@/generated/prisma/client`.
- [x] **UI** : `Button`, `Field`, `Modal`/`ConfirmModal`, `DataTable`, `StatusChip`, `Tabs`,
  `EmptyState`, `PageHeader`, `Toast`. Le formulaire public reprend celui de Jenny, recâblé sur
  `Field` et `Button`.

## Approche générale

Un **module optionnel `serving`** (« Candidatures au service ») porte :
- la candidature et ses affectations ;
- les réglages par église ;
- les règles d'accès ;
- le PDF ;
- les relances et la purge (tâche cron).

Le formulaire et le PDF de Jenny sont repris presque tels quels. Ce qui change autour :
- le rattachement à une église (adresse `/servir/<slug>`) ;
- le stockage privé de la photo ;
- un back-office `/candidatures` ;
- un **cycle de vie par affectation**, chaque département suivant ses étapes indépendamment.

La personne devient STAR du département dès l'**acceptation** par le département (D3) : on
réutilise le rattachement existant de `planning`, donc elle est planifiable sans code planning
nouveau. Un renvoi passe par le retrait existant, qui supprime aussi ses services et tâches à
venir dans ce département.

## Modèle de données

```prisma
enum ServingApplicationStatus {
  RECEIVED   // à traiter par le PVS (inclut « renvoyée, à réorienter », voir needsPvsAction)
  VALIDATED  // au moins une affectation créée
  REJECTED   // non retenue (décision PVS)
}

enum ServingAssignmentStatus {
  PENDING      // affectée, en attente d'accueil par le département
  OBSERVATION  // acceptée : STAR du département, en observation
  CONFIRMED
  SENT_BACK    // refusée avant accueil ou renvoyée pendant l'observation
}

enum MaritalStatus { SINGLE MARRIED DIVORCED WIDOWED }

/// Candidature au service (spec 073). Données personnelles sensibles : accès PVS/Admin avant
/// affectation, puis Resp./Ministre des départements à affectation active ; purge automatique.
model ServingApplication {
  id        String @id @default(cuid())
  churchId  String
  status    ServingApplicationStatus @default(RECEIVED)

  // Fiche (reprise du formulaire de Jenny)
  firstName      String  @db.VarChar(100)
  lastName       String  @db.VarChar(100)
  birthDate      DateTime @db.Date
  profession     String? @db.VarChar(150)
  maritalStatus  MaritalStatus?
  childrenCount  Int?
  street         String? @db.VarChar(200)
  city           String? @db.VarChar(100)
  postalCode     String? @db.VarChar(20)
  country        String? @db.VarChar(100)
  phone          String? @db.VarChar(30)
  email          String? @db.VarChar(200)
  baptized       Boolean?   // null = non renseigné (corrige « Non » par défaut)
  baptismDate    DateTime?  @db.Date
  baptismPlace   String? @db.VarChar(200)
  previousChurch Boolean?
  previousChurchName     String? @db.VarChar(200)
  previousChurchLocation String? @db.VarChar(200)
  pcncTrainings  Json      // string[] parmi une liste fermée
  hasServed      Boolean?
  servedDepartment     String? @db.VarChar(200)
  ministryService      String? @db.VarChar(300)
  communityService     String? @db.VarChar(300)
  otherRoles           String? @db.VarChar(300)
  availableToServe     Boolean?
  interests            String? @db.VarChar(500)
  observations         String? @db.Text
  journeyDetails       String? @db.Text
  spiritualGoals       String? @db.Text
  specificDetails      String? @db.Text
  photoKey       String  @db.VarChar(255)
  consentAt      DateTime

  // Traitement PVS
  memberId       String?   // fiche STAR liée (existante ou créée au premier accueil)
  decidedAt      DateTime? // validation ou non-retenue : départ du délai de conservation (D5)
  decidedById    String?
  rejectionReason String?  @db.Text
  purgeWarnedAt  DateTime?

  church      Church  @relation(fields: [churchId], references: [id])
  member      Member? @relation(fields: [memberId], references: [id], onDelete: SetNull)
  assignments ServingAssignment[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([churchId, status, createdAt])
  @@map("serving_applications")
}

model ServingAssignment {
  id            String @id @default(cuid())
  applicationId String
  departmentId  String
  status        ServingAssignmentStatus @default(PENDING)

  assignedById  String
  assignedAt    DateTime @default(now())
  acceptedAt    DateTime?
  acceptedById  String?
  observationEndsAt DateTime? // figée à l'acceptation (D6 : un réglage ne touche pas l'en-cours)
  decidedAt     DateTime?     // confirmation ou renvoi
  decidedById   String?
  sentBackReason String? @db.Text
  resolvedAt    DateTime?     // renvoi traité par le PVS (réaffectation ou non-retenue)
  endingReminderAt DateTime?  // rappel « fin proche » envoyé
  overdueRemindedAt DateTime? // dernière relance « échue »

  application ServingApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  department  Department         @relation(fields: [departmentId], references: [id])

  @@index([departmentId, status])
  @@index([applicationId])
  @@index([status, observationEndsAt])
  @@map("serving_assignments")
}

model ServingSettings {
  id                String @id @default(cuid())
  churchId          String @unique
  observationMonths Int    @default(3)   // D6
  retentionMonths   Int    @default(12)  // D5/D7
  church Church @relation(fields: [churchId], references: [id])
  updatedAt DateTime @updatedAt
  @@map("serving_settings")
}

// Department : adresse de contact (D2), utilisée ici pour les départements PVS.
model Department { contactEmail String? @db.VarChar(255) }
```

Points du modèle :
- **Une ligne par affectation, sans contrainte d'unicité** : un renvoi suivi d'une nouvelle
  affectation au même département garde l'historique.
- **« Renvoyée, à réorienter »** se déduit (pas de statut en plus) :
  `status = VALIDATED` et au moins une affectation `SENT_BACK` avec `resolvedAt = null`. La liste
  PVS l'affiche sous « À traiter ».
- **Pas de données dupliquées dans la fiche STAR** : le `Member` créé ne reçoit que prénom, nom,
  email et téléphone, comme une fiche saisie à la main.
- **Fonction de département** : ajout de `DEPT_FN.VIE_DES_STAR`, libellé « Vie des STAR (PVS) ».
  Le champ `Department.function` est une chaîne, donc pas de migration pour ça.
- **Migration** : `prisma migrate dev --name serving_applications`.

## Accès (`src/modules/serving/auth.ts` + `services/access.ts`)

Les règles d'accès sont des fonctions **pures**, testées sur des sessions fabriquées. Les gardes
chargent les données puis les appellent.

| Règle | Qui |
|---|---|
| `canManageApplications(session, churchId, pvsDeptIds)` | Super Admin ; rôle portant `serving:manage` (Admin) ; tout rôle dont `departments` contient un département PVS (même lecture que `isCaptureTeamMember`). Cela couvre un responsable du PVS (`user_departments`) et un STAR du PVS dont le compte est lié, puisque le rôle STAR porte son département d'appartenance. |
| `isDepartmentLead(session, churchId, dept)` | `DEPARTMENT_HEAD` dont `departments` contient le département (principal ou adjoint), ou `MINISTER` dont `ministryId` est celui du département |
| `canViewApplication` | `canManageApplications`, ou `isDepartmentLead` sur une affectation `PENDING`/`OBSERVATION`/`CONFIRMED` de la candidature. Un département qui a renvoyé (`SENT_BACK`) ne voit plus la fiche (spec). |
| `canDecideAssignment` | `isDepartmentLead` sur le département de l'affectation, ou Super Admin |
| `isOwnApplication(userId, application)` | le compte est lié (`MemberUserLink` validé, même église) au `memberId` de la candidature **et** une affectation est `OBSERVATION` ou `CONFIRMED` (D8). Vue réduite : sans motifs, sans affectations `PENDING`/`SENT_BACK`, sans journal. |
| `canEditSettings` | Super Admin, `serving:manage`, `DEPARTMENT_HEAD` d'un département PVS (D2, D6, D7) |

Le Secrétaire n'a **pas** `serving:manage`, et l'ouverture globale de `getUserDepartmentScope`
(rôles globaux) n'est **pas** utilisée ici : seule une liste explicite donne accès.

## API

Chaque route a son `contract.ts` (ADR-0023), puis `npm run openapi`.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/serving/public/[churchSlug]` | POST (public) | Turnstile + piège + débit (5/min/IP) | multipart : champs de la fiche, `photo`, `consent`, `turnstileToken`, `website` | `201 { ok: true }` (aucun identifiant renvoyé) |
| `/api/serving/applications` | GET | `canManage` ou `isDepartmentLead` (liste filtrée par ce que l'appelant peut voir) | `churchId`, `view=pvs\|department`, `status?` | candidatures résumées |
| `/api/serving/applications/[id]` | GET | `canViewApplication` ; **journalisé `VIEW`** | — | fiche + affectations + historique de renvois |
| `/api/serving/applications/[id]` | PATCH | `canManage` | `{ action: "reject", reason? }` ou `{ action: "link-member", memberId \| null }` | fiche |
| `/api/serving/applications/[id]/assignments` | POST | `canManage` | `{ departmentIds: string[] (≥ 1) }` | affectations créées |
| `/api/serving/assignments/[id]` | PATCH | `canDecideAssignment` | `{ action: "accept" }`, `{ action: "confirm" }`, `{ action: "send-back", reason (min 3) }` | affectation |
| `/api/serving/me` | GET | `requireAuth` + `isOwnApplication` (église courante) | — | fiche réduite (D8) ou `null` |
| `/api/serving/applications/[id]/photo` | GET | `canViewApplication` ou `isOwnApplication` | — | JPEG en flux, `no-store` |
| `/api/serving/applications/[id]/pdf` | GET | `canViewApplication` ou `isOwnApplication` ; **journalisé `EXPORT`** | — | PDF `attachment` |
| `/api/serving/applications/[id]/member-matches` | GET | `canManage` | — | fiches STAR de même nom ou même email |
| `/api/serving/settings` | GET / PUT | `isOwnApplication(userId, application)` | le compte est lié (`MemberUserLink` validé, même église) au `memberId` de la candidature **et** une affectation est `OBSERVATION` ou `CONFIRMED` (D8). Vue réduite : sans motifs, sans affectations `PENDING`/`SENT_BACK`, sans journal. |
| `canEditSettings` | `{ observationMonths 1–12, retentionMonths 1–36, pvsEmails: { departmentId, email \| null }[] }` | réglages |

Détails de la route publique :
- Avant lecture du corps : **411** sans `Content-Length`, **413** au-delà de 9 Mo (même garde que
  le logo de dons).
- Église inconnue, ou sans département PVS : **404**, même réponse que la page « non disponible ».
- La photo est contrôlée sur le format **décodé** (JPEG, PNG, WebP, HEIC si `sharp` le décode ;
  jamais de SVG), puis réencodée en JPEG 600×800 sans métadonnées. La logique est celle de
  `normalizeLogo`, réécrite dans le module.
- Elle est stockée sous `serving/<churchId>/<applicationId>.jpg` via `storage.uploadFile`, dans le
  bucket privé des médias.
- `consent` est requis à `true` et enregistré avec la date (`consentAt`).

Ordre dans la route d'affectation : la route charge la candidature, vérifie `canManage`, puis
appelle `assignApplication(…)`. Aucun effet sur la fiche STAR à ce stade.

Ordre dans l'acceptation (`accept`) : la route vérifie `canDecideAssignment` puis appelle
`acceptAssignment(id, actor, { attachMember })`, où `attachMember` est
`planning.attachMemberToDepartment`. Le service :
1. crée le `Member` (prénom, nom, email, téléphone) si `memberId` est nul et le lie à la
   candidature ;
2. appelle `attachMember` ;
3. passe l'affectation en `OBSERVATION` avec
   `observationEndsAt = acceptedAt + settings.observationMonths`.

Le renvoi pendant l'observation suit le même principe avec `detachMember`
(`planning.detachMemberFromDepartment`), qui supprime aussi les services et tâches à venir dans
ce département. Un refus avant l'accueil (`PENDING` → `SENT_BACK`) ne touche pas la fiche STAR.

## Services (`src/modules/serving/services/`)

- **`applications.ts`** :
  - `submitApplication` (public : validation, photo, création, notification PVS) ;
  - `listApplications` (deux vues : PVS ou département) ;
  - `getApplication` (journalise `VIEW`) ;
  - `rejectApplication` (passe aussi les renvois en attente en `resolvedAt`) ;
  - `linkMember`.
- **`assignments.ts`** :
  - `assignApplication` (refuse un département où la fiche STAR liée est déjà, et clôt les renvois
    en attente) ;
  - `acceptAssignment`, `confirmAssignment`, `sendBackAssignment`.
  - Ce sont des transitions **explicites** : une transition invalide renvoie 409, par exemple
    confirmer une affectation encore `PENDING`.
- **`state.ts`** (pur) :
  - `canTransition(from, action)` ;
  - `needsPvsAction(application)` ;
  - `observationEndsAt(acceptedAt, months)` ;
  - `observationPhase(assignment, now)`, qui renvoie `en cours`, `fin proche` (≤ 14 jours) ou
    `échue` ;
  - `retentionDeadline(application, retentionMonths)` (D5 : départ à `decidedAt` si non retenue,
    sinon `createdAt` si jamais traitée, sinon dernier renvoi non résolu).
- **`photo.ts`** : `normalizePhoto`, `getPhotoStream`.
- **`pdf.tsx`** : `renderApplicationPdf(application, photo, church)`, reprise de `FichePDF` :
  - typé, sans `any` ;
  - « Non renseigné » pour un booléen nul ;
  - nom et logo de l'église au lieu d'ICC Rennes en dur ;
  - pied de page « Document confidentiel — <église> ».
- **`settings.ts`** : `getServingSettings` (valeurs par défaut sans ligne), `updateServingSettings`
  (réglages et `Department.contactEmail` des départements PVS, journalisé).
- **`notifications.ts`** (domaine `serving`) :
  - `createNotification`/`notifyUsers`, avec lien seulement, prénom et nom au plus ;
  - PVS = responsables et membres liés des départements PVS, plus Admin ;
  - copie institutionnelle à `Department.contactEmail` par `sendEmail` direct, sur la **liste
    blanche** de `notifications-no-direct-email.test.ts`, avec un gabarit lien seul.
- **`lifecycle.ts`** : `runServingTasks(appUrl)`, tâche cron `serving`, module `serving`,
  `interval: 60` minutes, idempotente grâce aux horodatages :
  - rappel « fin d'observation proche » à J-14 (`endingReminderAt`) ;
  - relance « échue » tous les 7 jours (`overdueRemindedAt`), D4 ;
  - avertissement PVS un mois avant effacement d'une candidature jamais traitée
    (`purgeWarnedAt`), D5 ;
  - **purge** : candidatures arrivées à échéance, sans affectation `PENDING`, `OBSERVATION` ni
    `CONFIRMED`. Suppression de la ligne (affectations en cascade) **puis** de la photo
    (`deleteMediaFile`). Une photo dont la suppression échoue est journalisée et retentée au
    passage suivant via une clé orpheline. Le journal `DELETE` ne porte que l'identifiant.

**Journal d'audit** : `logAudit` accepte `"VIEW"` en plus. C'est un ajout au type, sans
migration, puisque `action` est une chaîne. Les consultations de fiche (`VIEW`) et les
téléchargements PDF (`EXPORT`) sont tracés avec `entityType: "ServingApplication"`.

## UI / composants

- **`/servir/[churchSlug]`** (public, hors `(auth)`) :
  - page serveur sur le modèle de `/rejoindre/[churchSlug]` (nom et logo d'église si l'interface
    en a un, spec 072) ;
  - `ServingForm` client = `FicheForm` de Jenny recâblé sur `Field`/`Button` et les tokens ;
  - ajout de la case de consentement et du texte « qui verra ta fiche / combien de temps » (durée
    lue dans les réglages) ;
  - `PublicFormUnavailable` si Turnstile n'est pas configuré, l'église est inconnue ou n'a pas de
    département PVS.
- **`/candidatures`** (authentifié), espace « Personnes » de `navigation.ts`. Le lien est calculé
  dans `(auth)/layout.tsx` comme `integrationLinks`. Il apparaît si l'utilisateur gère les
  candidatures **ou** est responsable ou Ministre d'un département qui a une affectation active.
  - Onglets (`Tabs`) :
    - « À traiter » (PVS) ;
    - « En cours » (affectées et en observation) ;
    - « Mes départements » (vue Resp./Ministre) ;
    - « Archivées » (confirmées, non retenues).
  - Liste en `DataTable` avec `StatusChip` par affectation : « En attente d'accueil »,
    « Observation jusqu'au … », « Échue », « Confirmé », « Renvoyé ».
- **`/candidatures/[id]`** : fiche (photo servie par la route authentifiée), boutons
  « Télécharger le PDF » et « Historique des affectations ». Actions selon le droit :
  - PVS :
    - « Valider et affecter » (`Modal` : choix multiple de départements, suggestions de fiches
      STAR existantes avec « Rattacher ») ;
    - « Ne pas retenir » (`ConfirmModal` + motif).
  - Resp./Ministre :
    - « Accueillir dans le département » ;
    - « Confirmer » ;
    - « Renvoyer au PVS » (motif obligatoire).
- **« Ma fiche de candidature »** dans « Mon profil » (`/profile`) : carte en lecture seule
  (réponses, photo, PDF, départements et étape), affichée si `getOwnApplication` (exporté par
  `@/modules/serving`) renvoie une fiche et si `registry.has("serving")`. Le DTO réduit est
  construit côté serveur (`toOwnApplicationView`) : les champs internes ne quittent jamais le
  serveur. Texte « Pour corriger une information, adresse-toi au PVS ».
- **`/candidatures/parametres`** :
  - durée d'observation ;
  - durée de conservation ;
  - adresse email de chaque département PVS ;
  - `canEditSettings` requis.
- **Badge « En observation »** :
  - la liste des STAR d'un département (`/admin/members`) affiche un badge pour les fiches en
    observation dans ce département ;
  - la page charge les identifiants via `listObservationMemberIds(churchId)`, exporté par
    `@/modules/serving`, si `registry.has("serving")`, et les passe en prop ;
  - le module `planning` ne dépend pas de `serving` ;
  - la grille de planning n'est pas modifiée dans ce lot (voir Risques).
- **Mobile** : formulaire public déjà mobile (pastilles de 44 px). Le back-office suit
  `DataTable`, qui bascule en cartes, et des actions en `BottomSheet` sous `md`.

## Manifeste du module `serving`

```ts
defineModule({
  name: "serving", version: "1.0.0", dependsOn: ["core", "planning"],
  routes: {
    authenticated: [{ path: "/candidatures" }],
    api: [{ path: "/api/serving" }],
    public: [{ path: "/servir" }, { path: "/api/serving/public", method: "POST" }],
  },
  permissions: { "serving:manage": ["SUPER_ADMIN", "ADMIN"] },
  notificationDomains: [{ key: "serving", label: "Candidatures au service",
    description: "Nouvelles candidatures, affectations, fins d'observation et renvois.",
    defaultEmail: true, visibleWith: ["serving:manage"] }],
});
```

Ce que l'ajout du module entraîne aussi :
- l'ajouter à `manifests.ts` ;
- mettre à jour la matrice figée de `permissions.test.ts`, le tableau de `CLAUDE.md` et
  `docs/auth.md` ;
- ajouter une règle dependency-cruiser `no-serving-imports-other-modules` (sauf `storage`).

Le domaine de notification est aussi visible par l'historique de réception, ce qui couvre l'équipe
PVS et les responsables sans `serving:manage`.

## Décisions & alternatives écartées

- **Choix : module dédié `serving`** — *Pourquoi* : le circuit traverse PVS, départements et
  planning, avec ses propres données sensibles. Le module se désactive par déploiement
  (ADR-0012).
  - *Écarté* : l'intégrer au module `integration`, dont le périmètre (familles, parcours) et les
    gardes (bergers) sont différents ; y mêler ces fiches élargirait l'accès.
- **Choix : cycle de vie par affectation** — *Pourquoi* : plusieurs départements décident
  indépendamment (spec).
  - *Écarté* : un statut unique sur la candidature, qui ne sait pas représenter « confirmé en
    Accueil, renvoyé de Louange ».
- **Choix : la personne devient STAR à l'acceptation, via `attachMemberToDepartment` injecté** —
  *Pourquoi* : D3 (planifiable pendant l'observation), sans dupliquer la logique du parking
  « Sans département », ni dépendance `serving → planning` interdite par les frontières.
  - *Écarté* : créer la fiche STAR dès la validation PVS, ce qui la rendrait planifiable avant
    l'accord du département.
- **Choix : PDF généré côté serveur avec `@react-pdf/renderer`** (le `FichePDF` de Jenny) —
  *Pourquoi* : la mise en page existe et elle est soignée, le rendu se fait à la demande et rien
  n'est stocké.
  - *Écarté* : `jspdf`, déjà présent mais utilisé côté client, qui obligerait à refaire toute la
    mise en page.
  - **Condition** : `npm audit --omit=dev --audit-level=high` et `npm run build` passent. Sinon,
    repli sur `jspdf` côté serveur.
- **Choix : photo dans le bucket privé des médias** (module `storage`), servie par une route
  authentifiée — *Pourquoi* : jamais d'URL publique ni pré-signée qui circule ; la route
  revérifie l'accès à chaque lecture.
- **Choix : `Department.contactEmail`** plutôt qu'un email dans `ServingSettings` — *Pourquoi* :
  l'adresse appartient à l'équipe (une église peut avoir plusieurs départements PVS) et resservira
  ailleurs sans migration. Elle n'est éditable que depuis `/candidatures/parametres` dans ce lot.
- **Choix : journaliser `VIEW`** — *Pourquoi* : la spec exige la trace des consultations. C'est un
  ajout local au type `logAudit`, sans ADR : ce n'est pas un changement de pattern global, et
  d'autres modules pourront l'adopter.
- **Écarté : envoi du PDF par email** (version de Jenny) — données sensibles hors de l'application
  (spec).
- **Écarté : `photoUrl` public / `next/image`** — la photo ne doit jamais avoir d'URL stable.

## Risques & points d'attention

- **Données sensibles (RGPD, art. 9)** :
  - aucune donnée de la fiche dans les journaux applicatifs (`logger`) ni dans les notifications,
    qui contiennent au plus le prénom et le nom (contrainte des notifications natives, spec 068) ;
  - journal d'audit sans contenu de fiche.
- **`@react-pdf/renderer`** :
  - poids et compatibilité avec React 19 et le bundling Next 16 (le déclarer dans
    `serverExternalPackages` si besoin) ;
  - à valider tôt (première tâche), avec le repli `jspdf` décrit plus haut.
- **`attachMemberToDepartment` ouvre sa propre transaction** : on ne peut pas l'appeler avec un
  client de transaction. L'acceptation enchaîne donc :
  1. création ou lecture du `Member` ;
  2. rattachement (sa transaction) ;
  3. mise à jour de l'affectation.

  Si l'étape 3 échoue après le rattachement, une nouvelle tentative trouve le STAR déjà dans le
  département (409). Le service traite ce 409 comme un succès quand l'affectation est encore
  `PENDING`, ce qui rend l'opération idempotente. Le renvoi suit le même principe avec le retrait.
- **Renvoi d'un STAR rattaché à une fiche existante** : il ne retire que le département de cette
  affectation. Dernier département : bascule vers « Sans département » (comportement existant).
- **Responsable sans compte lié ou Ministre absent** : aucune personne notifiée. On se rabat sur
  l'Admin, comme les alertes comptables.
- **Plusieurs départements PVS** : l'équipe est l'union des départements PVS, et chaque adresse
  `contactEmail` reçoit la copie.
- **Charge de la route publique** : 9 Mo en mémoire par envoi, borné par le 413 et la limite de
  débit.
- **Grille de planning** : le badge « en observation » n'y est pas dans ce lot (seulement dans
  `/admin/members` et `/candidatures`). Si la relecture le juge nécessaire, il sera ajouté en
  passant les identifiants depuis la page `/dashboard`.
- **`lint:prisma-boundary`** : les nouvelles routes n'importent pas Prisma (tout passe par le
  module), donc le seuil ne bouge pas.

## Découpage proposé (une branche `feat/candidatures-service`)

1. **Socle** : module, manifeste, migration, fonction PVS, réglages, formulaire public, stockage
   de la photo, notification « nouvelle candidature », liste et fiche PVS, PDF, journal.
2. **Circuit départements** : affectation, acceptation (STAR + observation), confirmation, renvoi,
   réaffectation, rapprochement avec une fiche existante, vue Resp./Ministre, badge.
3. **Cycle de vie** : rappels, relances « échue », avertissement et purge.

La recette se fait après le lot 3, avec une seule PR vers `main`. Le découpage en sous-PR est
possible si la revue le demande.

## Stratégie de tests (Vitest)

- **`state.ts`** :
  - transitions autorisées et interdites ;
  - `needsPvsAction` ;
  - `observationEndsAt` (fin de mois, par exemple 31 janvier + 1 mois) ;
  - `observationPhase` aux bornes J-14 et échéance ;
  - `retentionDeadline` pour les trois cas de D5.
- **`access.ts`**, sessions fabriquées :
  - Admin oui, Secrétaire non ;
  - membre PVS lié (rôle STAR) et responsable PVS oui ;
  - Resp. d'un autre département non ;
  - Ministre d'un autre ministère non ;
  - Resp. du département affecté oui, sauf après `SENT_BACK` ;
  - réglages : responsable PVS oui, membre PVS non.
- **Vue STAR (D8)** : `isOwnApplication` vrai seulement avec un lien validé et une affectation
  `OBSERVATION`/`CONFIRMED` ; faux après renvoi de toutes les affectations ; `toOwnApplicationView`
  n'expose ni `sentBackReason`, ni `rejectionReason`, ni les affectations `PENDING`/`SENT_BACK`.
- **Schéma de la route publique** :
  - booléen non répondu → `null` ;
  - consentement requis ;
  - formations hors liste refusées ;
  - champs vides → `null` ;
  - date invalide refusée ;
  - piège rempli → faux succès sans effet (service mocké).
- **`photo.ts`** : SVG ou fichier non image refusé, PNG réencodé en JPEG sans EXIF (fixture
  `sharp` en mémoire).
- **`assignments.ts`**, Prisma mocké comme les tests de services existants :
  - acceptation qui crée le `Member` puis appelle `attachMember` ;
  - acceptation rejouée après un 409, idempotente ;
  - renvoi qui appelle `detachMember` seulement depuis `OBSERVATION` ;
  - affectation refusée vers un département déjà porté par la fiche liée.
- **`lifecycle.ts`** :
  - rappel envoyé une seule fois ;
  - relance « échue » espacée de 7 jours ;
  - purge sans toucher une candidature à affectation active ;
  - photo supprimée après la ligne.
- **Garde-fous existants à mettre à jour** :
  - `permissions.test.ts` (matrice) ;
  - `route-exhaustiveness.test.ts` (nouveaux préfixes) ;
  - `openapi.test.ts` (`npm run openapi`) ;
  - `notifications-no-direct-email.test.ts` (liste blanche, `contactEmail` institutionnelle).
- **Vérification manuelle en recette** : soumission depuis mobile, téléchargement du PDF, circuit
  complet PVS → département → renvoi → réaffectation → confirmation.
