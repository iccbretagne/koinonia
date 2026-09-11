# Plan technique — Feuille d'annonces d'un culte

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-09-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau service dans `src/modules/planning/services/`, exporté via
      `@/modules/planning` ; upload/download S3 via `@/modules/storage` (index public)
- [x] **Sécurité** : toutes les routes protégées par `requireChurchPermission("planning:view", churchId)`
      (via `resolveChurchId("event", eventId)`) + contrôle composite additionnel pour
      dépôt/retrait/téléchargement ; multi-tenant `churchId` jamais optionnel
- [x] **Permissions** : le dépôt/retrait et le téléchargement ne se réduisent pas à une entrée
      `rolePermissions` classique (composite rôle + fonction département + ministère) — même
      schéma que spec 041, documenté ci-dessous
- [x] **Validation** Zod sur toutes les mutations
- [x] **Migration** Prisma prévue (nouveau modèle `AnnouncementSheet`)
- [x] **Enums** : aucun nouvel enum nécessaire (mimeType validé par whitelist de chaînes)
- [x] **UI** : réutilise `src/components/ui/` (`Button`), s'intègre à la page star-view déjà
      modifiée par la spec 041 plutôt que de dupliquer un pattern de dépôt de fichier

## Approche générale

Un modèle `AnnouncementSheet` en relation 1:1 avec `Event` (comme `EventReport`), stockant un
fichier docx/PDF sur S3 via le module `storage` existant (pattern déjà utilisé par
`audio/settings/cover/sign` : URL de dépôt signée générée côté serveur, upload direct
navigateur → S3, puis confirmation qui crée/remplace l'enregistrement BDD et supprime l'ancien
objet S3 s'il y en avait un).

L'UI de dépôt/retrait et l'affichage en lecture s'intègrent à la page
`/events/[eventId]/star-view` (déjà le point d'entrée commun choisi par la spec 041 pour ce
type de fonctionnalité rattachée à un événement et visible par des populations mixtes
rôle/département) — elle est déjà accessible à toutes les populations concernées ici via
`planning:view` (voir vérification ci-dessous). Une page de liste dédiée
(`/events/announcement-sheets`) couvre le scénario « liste des feuilles des prochains cultes ».

Deux fonctions de département sont ajoutées à `DEPT_FN` pour rester cohérent avec le pattern déjà
en place (identification par fonction, jamais par nom de département, cf. ADR implicite des
specs 021/041) : `MODERATION` (nouvelle) et `CAPTATION_AUDIO` (déjà utilisée en dur dans le module
audio — promue dans `DEPT_FN` pour n'avoir qu'une seule source de vérité maintenant qu'un second
module la consomme).

`planning:view` couvre bien toutes les populations de la spec :
- Secrétariat (rôle Secrétaire ou n'importe quel membre d'un département fonction
  `SECRETARIAT`) : Secrétaire a `planning:view` ; un membre simple est généralement rôle STAR, qui
  conserve `planning:view` (CLAUDE.md, spécificités STAR).
- Coordination (Ministre du ministère Coordination générale, ou responsable de département de ce
  ministère) : Ministre et Responsable de département ont tous deux `planning:view`.
- Admin / Super Admin : `planning:view` de toute façon.
- Lecteurs (Modération, Communication, Régie/Captation, Production média) : membres simples,
  généralement rôle STAR → `planning:view` conservé.

## Modèle de données

```prisma
// Feuille d'annonces d'un culte (spec 040) — une seule par événement, remplacée à chaque dépôt.
model AnnouncementSheet {
  id           String   @id @default(cuid())
  churchId     String
  eventId      String   @unique
  key          String   // clé S3 de l'objet actuel
  filename     String   // nom de fichier original (affichage)
  mimeType     String
  uploadedById String
  uploadedAt   DateTime @default(now())

  church     Church @relation(fields: [churchId], references: [id])
  event      Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  uploadedBy User   @relation(fields: [uploadedById], references: [id])

  @@index([churchId])
  @@map("announcement_sheets")
}
```

Relations inverses à ajouter : `Event.announcementSheet AnnouncementSheet?`,
`Church.announcementSheets AnnouncementSheet[]`,
`User.announcementSheetsUploaded AnnouncementSheet[] @relation("AnnouncementSheetUploadedBy")`.

`DEPT_FN` (`src/lib/department-functions.ts`) : ajout de `MODERATION: "MODERATION"` et
`CAPTATION_AUDIO: "CAPTATION_AUDIO"` (déjà utilisée en chaîne littérale dans
`src/modules/audio/services/access.ts` et `src/modules/audio/auth.ts` — remplacée par la
constante partagée dans ce même commit, sans changement de comportement).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/events/[eventId]/announcement-sheet/sign` | POST | `planning:view` + `canDepositAnnouncementSheet` | `{ filename, mimeType, size }` | `{ key, url }` |
| `/api/events/[eventId]/announcement-sheet` | POST | `planning:view` + `canDepositAnnouncementSheet` | `{ key, filename, mimeType }` | `{ sheet }` (201) |
| `/api/events/[eventId]/announcement-sheet` | GET | `planning:view` + `canReadAnnouncementSheet` | — | `{ sheet: {...} \| null, downloadUrl?: string }` |
| `/api/events/[eventId]/announcement-sheet` | DELETE | `planning:view` + `canDepositAnnouncementSheet` | — | `{ success: true }` |
| `/api/events/announcement-sheets` | GET | `planning:view` + `canReadAnnouncementSheet` | `?from=&to=` | `[{ event, sheet? }]` |

Validation Zod du dépôt (`sign` et confirmation) :

```typescript
const signSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  size: z.number().int().positive().max(20 * 1024 * 1024), // 20 Mo
});
```

`POST /announcement-sheet` (confirmation) revalide l'existence de l'objet S3 (`fileExists(key)`)
avant de créer/remplacer l'enregistrement — évite qu'un client confirme un dépôt qui n'a en
réalité pas atteint S3.

Remplacement d'une feuille existante : `prisma.announcementSheet.upsert` sur `eventId`, puis
suppression de l'ancien objet S3 (`deleteMediaFile(oldKey)`) une fois l'upsert réussi — jamais
l'inverse (éviter un état sans fichier si la suppression S3 échouait avant l'écriture BDD).

## Services / logique métier

Fichier `src/modules/planning/services/announcement-sheet.service.ts` (même fichier réunissant
permissions + accès données + notification, comme `opening-closing.service.ts` de la spec 041) :

- `canDepositAnnouncementSheet(session, churchId)` : `true` si `events:manage` (Secrétaire/
  Admin/Super Admin — géré en amont par l'appelant comme en spec 041), sinon si le `Member` lié
  appartient à un département fonction `SECRETARIAT`, sinon si le rôle est `MINISTER` scopé
  (`getUserMinistryScope`) sur le ministère « Coordination générale », sinon si
  `getUserDepartmentScope` inclut un département dont le `ministryId` est celui de « Coordination
  générale », sinon `false`.
- `canReadAnnouncementSheet(session, churchId)` : `true` si `canDepositAnnouncementSheet` (« les
  déposants eux-mêmes » — sur-ensemble naturel), sinon si le `Member` lié appartient à un
  département de fonction `MODERATION`, `COMMUNICATION`, `CAPTATION_AUDIO` ou
  `PRODUCTION_MEDIA`.
- `findCoordinationMinistryId(churchId)` : résout l'id du ministère nommé « Coordination
  générale » dans l'église (`prisma.ministry.findFirst({ where: { churchId, name: "Coordination
  générale" } })`) — `null` si absent (aucune permission Coordination accordée dans ce cas,
  documenté comme risque ci-dessous).
- `notifyReaders(churchId, eventId, eventTitle, isUpdate)` : résout l'ensemble unique des
  `userId` lecteurs (mêmes populations que `canReadAnnouncementSheet`, requêtées directement plutôt
  que testées utilisateur par utilisateur) et crée une notification par utilisateur
  (`type: "ANNOUNCEMENT_SHEET_DEPOSITED"`, lien `/events/{eventId}/star-view`), titre distinct
  si `isUpdate` (« mise à jour » vs « disponible »).

Mêmes imports différés que `opening-closing.service.ts` (`@/lib/prisma`, `@/lib/auth`,
`@/lib/notifications`) — évite de casser les tests import ant `@/modules/planning` sans mocker ces
modules (régression déjà rencontrée et corrigée en spec 041).

## UI / composants

- `src/app/(auth)/events/[eventId]/star-view/AnnouncementSheetManager.tsx` (nouveau, `"use
  client"`) : section « Feuille d'annonces » sous la section Ouverture/Fermeture existante —
  état actuel (nom de fichier + date de dépôt, ou « pas encore disponible »), bouton
  téléchargement si lecteur, zone de dépôt/remplacement + bouton retrait si déposant
  (`data.announcementSheet.canDeposit`).
- `star-view/route.ts` : ajoute `announcementSheet` à l'`include` Prisma et au payload
  (`{ filename, uploadedAt, canDeposit, canRead }` — jamais le `downloadUrl` signé directement
  dans cette réponse : signé à la demande via `GET /announcement-sheet` pour limiter sa durée de
  vie, comme `getSignedDownloadUrl` ailleurs dans le repo).
- `src/app/(auth)/events/announcement-sheets/page.tsx` (nouveau, Server Component) : liste des
  événements à venir de l'église courante avec statut de la feuille (déposée le JJ/MM, ou « pas
  encore disponible »), lien vers `star-view` de chacun — gardée par `canReadAnnouncementSheet`,
  redirige vers `/no-access` sinon (même pattern que le guard de layout `(auth)`).
- Entrée de navigation : ajoutée à côté du lien existant vers les événements (visible seulement si
  la permission `planning:view` est présente — le contrôle fin `canReadAnnouncementSheet` reste
  serveur, la page elle-même filtre).

## Décisions & alternatives écartées

- **Choix** : identifier la Coordination par nom exact de ministère (« Coordination générale »),
  comme déjà décidé dans la spec (clarification du 2026-09-11) — *Pourquoi* : `Ministry` n'a pas
  d'équivalent au champ `function` de `Department` ; créer un tel champ pour un unique
  consommateur serait de la sur-ingénierie (principe VII de `CLAUDE.md`).
- **Écarté** : ajouter un champ `Ministry.function` générique — *Raison* : aucun autre besoin
  identifié aujourd'hui ; à reconsidérer si une deuxième feature a besoin d'identifier un
  ministère par fonction plutôt que par nom.
- **Choix** : réutiliser `/events/[eventId]/star-view` plutôt que créer une nouvelle page dédiée
  ou modifier le guard de la fiche événement admin — *Pourquoi* : même raisonnement que la
  déviation actée en spec 041 (`planning:view` est déjà le seul point d'entrée commun à toutes
  les populations concernées ; la fiche admin (`events:manage`) exclurait Coordination
  rang-et-fichier et tous les lecteurs).
- **Choix** : upload direct navigateur → S3 via URL signée (pattern `audio/settings/cover/sign`)
  plutôt que upload en `multipart/form-data` vers l'API Next.js — *Pourquoi* : pattern déjà
  établi et testé dans le repo pour des fichiers de taille modeste, évite de faire transiter le
  fichier par le serveur Next.js.
- **Écarté** : upload multipart (comme les gros fichiers médias) — *Raison* : docx/PDF de feuille
  d'annonces ne dépassent pas quelques Mo, pas besoin de la complexité multipart.
- **Choix** : `canReadAnnouncementSheet` inclut `canDepositAnnouncementSheet` comme sur-ensemble
  plutôt que deux populations disjointes à maintenir en parallèle — *Pourquoi* : couvre
  directement le critère spec « les déposants eux-mêmes » sans duplication de logique.
- **Écarté** : stocker le champ `key` S3 comme historique versionné (une ligne par dépôt) —
  *Raison* : hors périmètre spec (« Édition ou prévisualisation » exclue, une seule version
  visible à la fois) ; upsert 1:1 suffit et l'ancien objet S3 est supprimé au remplacement.

## Risques & points d'attention

- Si le ministère « Coordination générale » n'existe pas encore dans une église (pas encore créé
  par son administration), personne n'obtient l'accès Coordination tant qu'il n'est pas créé avec
  ce nom exact — comportement attendu mais silencieux : aucune erreur, juste une population
  vide. À signaler dans le guide utilisateur si besoin (hors périmètre technique de ce plan).
- Un renommage du ministère « Coordination générale » romprait le matching par nom — risque
  accepté explicitement par la clarification de spec (alternative Ministry.function écartée
  ci-dessus).
- Promouvoir `CAPTATION_AUDIO` dans `DEPT_FN` touche un fichier consommé par le module audio
  (`src/modules/audio/services/access.ts`, `src/modules/audio/auth.ts`) — changement mécanique
  (remplacement de la chaîne littérale par la constante), à vérifier par les tests existants du
  module audio (`npm run test` doit rester vert, aucune nouvelle régression attendue).
- Nettoyage S3 à la suppression d'un événement : `onDelete: Cascade` sur `eventId` supprime la
  ligne BDD, mais pas l'objet S3 sous-jacent — même limite déjà acceptée pour d'autres médias du
  repo (pas de tâche de purge S3 différée dans ce plan, cohérent avec le hors-périmètre spec
  « génération automatique »/pas de gestion de cycle de vie avancée).

## Stratégie de tests

- `announcement-sheet.service.test.ts` : les branches de `canDepositAnnouncementSheet` (Secrétaire
  events:manage, membre Secrétariat, Ministre Coordination, responsable dept Coordination, refus)
  et de `canReadAnnouncementSheet` (déposant, lecteur Modération/Communication/Captation/Production
  média, refus) ; `findCoordinationMinistryId` (trouvé, absent).
- `announcement-sheet.test.ts` (route) : sign (validation mimeType/size, 403 non habilité), POST
  confirmation (création, remplacement avec suppression de l'ancien objet S3, 404 si l'objet S3
  signé n'existe pas), GET (feuille présente avec URL signée, absente → `null`, 403 non lecteur),
  DELETE (retrait, 403, 404).
- Extension du test `star-view.test.ts` (déjà créé en spec 041) pour la présence
  d'`announcementSheet` dans la réponse.
- Test de la page liste `/events/announcement-sheets` si un test de route équivalent existe déjà
  pour une page similaire dans le repo (sinon test de la route GET `/api/events/announcement-sheets`
  suffit à couvrir la logique, la page Server Component n'ayant pas de logique propre au-delà de
  l'appel Prisma direct).
