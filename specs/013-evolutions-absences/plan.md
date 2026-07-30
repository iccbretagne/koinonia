# Plan technique — Évolutions du module Absences

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout reste dans `src/modules/planning` (le sous-domaine `absences`
      existant, cf. spec [[007-gestion-absences-star]]) — aucun nouvel import cross-module ;
      `src/app/` continue d'importer uniquement `@/modules/planning`.
- [x] **Sécurité** : nouvelles routes/actions protégées par `requireAuth()` +
      `requireChurchPermission("absences:manage"/"absences:view", churchId)` selon le cas ; scope
      département/ministère revérifié serveur (jamais fait confiance au payload client), y compris
      pour la liste d'IDs envoyée à l'export.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune nouvelle permission créée,
      réutilisation de `absences:view`/`absences:manage` existantes.
- [x] **Validation** Zod sur `POST /api/absences` (étendu), `PATCH /api/absences/[id]` (étendu) et
      `POST /api/absences/export` (nouveau).
- [x] **Migration** Prisma prévue : nouveau modèle `AbsenceBackup` + enum `AbsenceBackupType`.
- [x] **Enums** : `AbsenceBackupType` importé depuis `@/generated/prisma/client`.
- [x] **UI** : réutilise `DataTable`, `Modal`, `Button`, `Input`, `Select`, `CheckboxGroup` de
      `src/components/ui/` ; un seul nouveau composant de présentation (`AbsencesTimeline.tsx`,
      propre au module, pas un composant générique réutilisable ailleurs).

## Approche générale

Les cinq évolutions restent dans le périmètre déjà posé par la spec 007 : même modèle `Absence`,
même service `src/modules/planning/services/absence.service.ts`, mêmes routes
`src/app/api/absences/`. Aucune n'introduit de nouveau module ni de nouvelle permission.

- **Backup** (#1) : nouveau modèle `AbsenceBackup`, rattaché à `Absence`, pointant soit vers un
  `Member` (STAR), soit vers un `UserChurchRole` (Resp. département ou Ministre — le rôle exact
  est déjà porté par `UserChurchRole.role`, donc un seul type suffit pour les deux). Alimenté et
  notifié dans `declareAbsence`/`updateAbsence`, jamais dans `cancelAbsence` (les backups sont
  simplement notifiés de l'annulation comme les responsables, pas de nouvelle logique).
- **Édition** (#2) : nouvelle action `update` sur la route `PATCH /api/absences/[id]` existante
  (à côté de `cancel`), portée par un nouveau service `updateAbsence` qui réutilise
  `findAbsenceConflicts`/`resolveResponsibleUserIds` déjà présents.
- **Frise** (#3) : uniquement client — un composant de rendu alternatif à `DataTable`, branché sur
  `displayedAbsences` (déjà filtré/trié en mémoire), pas de nouvel appel réseau.
- **Export** (#4) : nouvelle route qui reçoit la liste des IDs actuellement affichés (voir
  Décisions) et génère un classeur avec `ExcelJS`, sur le modèle de
  `src/app/api/discipleships/export/route.ts`.
- **Date de fin liée** (#5) : uniquement client, dans le formulaire de déclaration/édition
  d'`AbsencesClient.tsx`.

## Modèle de données

```prisma
enum AbsenceBackupType {
  STAR
  RESPONSIBLE
}

model AbsenceBackup {
  id               String            @id @default(cuid())
  absenceId        String
  type             AbsenceBackupType
  memberId         String?
  userChurchRoleId String?
  createdAt        DateTime          @default(now())

  absence        Absence         @relation(fields: [absenceId], references: [id], onDelete: Cascade)
  member         Member?         @relation(fields: [memberId], references: [id], onDelete: Cascade)
  userChurchRole UserChurchRole? @relation(fields: [userChurchRoleId], references: [id], onDelete: Cascade)

  @@unique([absenceId, memberId])
  @@unique([absenceId, userChurchRoleId])
  @@map("absence_backups")
}
```

Ajouts de relations inverses :
- `Absence.backups AbsenceBackup[]`
- `Member.absenceBackups AbsenceBackup[]`
- `UserChurchRole.absenceBackups AbsenceBackup[]`

`type` distingue explicitement les deux cas plutôt que de le déduire de
`memberId != null`/`userChurchRoleId != null` — plus lisible dans les requêtes et les tests, et
protège contre un état incohérent (les deux colonnes renseignées) qui resterait sinon possible
sans contrainte `CHECK` (non supporté nativement par Prisma sur MariaDB). Cette cohérence
(exactement un des deux champs rempli, aligné avec `type`) est vérifiée dans le service, pas en
base — même approche que `AbsenceBackup` vis-à-vis de `cancelledById`/`cancelledAt` sur `Absence`.

Pointer vers `UserChurchRole` plutôt que directement vers `User` donne accès sans jointure
supplémentaire au `role` (DEPARTMENT_HEAD/MINISTER, pour l'affichage), au `ministryId`, et aux
`departments` couverts — utile pour l'affichage dans la vue transverse et pour valider le
périmètre à l'écriture.

Migration : `npm run db:migrate` (nom suggéré `add_absence_backups`).

Aucun changement sur `Absence` elle-même : la date de fin, le motif, les dates redeviennent
modifiables via le service (pas de nouveau champ requis — `updatedAt` existe déjà et suffit à
tracer la dernière modification).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/absences` | POST | inchangée (self ou `absences:manage` scopé) | *(étendu)* `{ churchId, memberId, startDate, endDate, reason?, backups?: BackupInput[] }` | `201 { ...absence, backups }` |
| `/api/absences/[id]` | PATCH | inchangée (créateur, self, resp/ministre scopé, ou manager global) | *(étendu)* `{ action: "cancel" } \| { action: "update", startDate?, endDate?, reason?, backups?: BackupInput[] }` | `{ ...absence, backups }` |
| `/api/absences/export` | POST *(nouveau)* | `requireChurchPermission("absences:view", churchId)` | `{ churchId, absenceIds: string[] }` | Fichier `.xlsx` (`Content-Disposition: attachment`) |

`BackupInput` (Zod, réutilisé dans `POST` et `PATCH action=update`) :

```ts
const backupSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("STAR"), memberId: z.string().min(1) }),
  z.object({ type: z.literal("RESPONSIBLE"), userChurchRoleId: z.string().min(1) }),
]);

const createSchema = z.object({
  churchId: z.string().min(1),
  memberId: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).nullable().optional(),
  backups: z.array(backupSchema).max(10).optional(),
}).refine(/* endDate >= startDate, inchangé */);

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("update"),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    reason: z.string().max(500).nullable().optional(),
    backups: z.array(backupSchema).max(10).optional(),
  }),
]);
```

`GET /api/absences` (inchangée en signature) : la réponse par absence gagne un champ
`backups: Array<{ id, type: "STAR"|"RESPONSIBLE", name: string, role?: "DEPARTMENT_HEAD"|"MINISTER" }>`.

Validation serveur des backups (dans la route `POST`/`PATCH`, avant d'appeler le service — même
esprit que la vérification `deptScope`/`withinScope` déjà présente) :

- Rejette (`403`) tout `backups` non vide si `!isSelf` — cohérent avec la spec (jamais de backup
  sur une absence déclarée pour un tiers).
- Rejette (`403`) tout `backups` non vide si le déclarant n'a, dans `churchId`, ni rôle
  `DEPARTMENT_HEAD` ni `MINISTER`.
- Pour chaque entrée `STAR` : le `memberId` doit appartenir au département du déclarant
  (`DEPARTMENT_HEAD`) ou à un département du ministère du déclarant (`MINISTER`), sinon `403`.
- Pour chaque entrée `RESPONSIBLE` : le `userChurchRoleId` ciblé doit être, selon le rôle du
  déclarant :
  - `DEPARTMENT_HEAD` → soit le `MINISTER` du ministère de son département, soit un autre
    `DEPARTMENT_HEAD` d'un département du **même** ministère ;
  - `MINISTER` → un autre `MINISTER` de la même église (`churchId`), jamais lui-même.
  Toute autre cible → `403`.

## Services / logique métier

`src/modules/planning/services/absence.service.ts` (extension du fichier existant) :

- `declareAbsence(params)` : signature étendue avec `backups?: BackupInput[]`. Dans la même
  transaction que la création de l'`Absence` :
  - crée les lignes `AbsenceBackup` correspondantes ;
  - pour chaque backup `STAR`, résout un éventuel `MemberUserLink` (comme pour le STAR absent
    lui-même) et notifie ce user s'il existe (`ABSENCE_BACKUP_ASSIGNED`) — pas de notification si
    la fiche STAR backup n'a pas de compte lié, cohérent avec le traitement déjà appliqué au STAR
    absent en cas de conflit ;
  - pour chaque backup `RESPONSIBLE`, résout `userChurchRole.userId` et notifie directement
    (`ABSENCE_BACKUP_ASSIGNED`).

- `updateAbsence(params): Promise<Absence>` *(nouveau)* :
  - Recharge l'absence, vérifie `status === "ACTIVE"` et que sa date de fin **actuelle** n'est pas
    déjà passée (sinon `ApiError(409, "Absence déjà passée, non modifiable")`).
  - Si `startDate` est fourni et que l'absence a déjà commencé (`absence.startDate <= now`),
    refuse toute nouvelle `startDate` antérieure à la date de début déjà enregistrée
    (`ApiError(400)`) — l'absence en cours ne peut être raccourcie/allongée que sur sa partie
    future.
  - Calcule les conflits **avant** (période actuelle) et **après** (période patchée) via
    `findAbsenceConflicts`.
  - Transaction : met à jour `startDate`/`endDate`/`reason` fournis ; si `backups` est fourni,
    supprime les `AbsenceBackup` existants et recrée la liste transmise (remplacement complet,
    plus simple et suffisant — pas de cas d'usage de diff partiel identifié) ; notifie
    `ABSENCE_UPDATED` à l'union des destinataires déjà notifiés à la déclaration (responsables +
    anciens backups + STAR si conflit précédent) et des nouveaux destinataires (nouveaux backups) ;
    si un nouveau conflit apparaît qui n'existait pas avant, notifie `ABSENCE_CONFLICT`
    exactement comme `declareAbsence`.
  - Émet `planning:absence:updated`.

- Notification des backups à l'annulation : `cancelAbsence` étendu pour inclure, dans
  `recipients`, les utilisateurs résolus depuis `absence.backups` (au même titre que les
  responsables) — pas de nouveau type de notification, `ABSENCE_CANCELLED` existant suffit.

Nouveaux événements dans `PlanningEvents` (`src/modules/planning/events.ts`) :

```ts
"planning:absence:updated": {
  absenceId: string;
  churchId: string;
  memberId: string;
  updatedById: string;
  startDate: string;
  endDate: string;
  hasConflict: boolean;
};
```

Aucun abonnement cross-module requis (même raisonnement que `planning:absence:declared`).

## UI / composants

- **`AbsencesClient.tsx`** (extension) :
  - Le formulaire de déclaration (`Modal`) affiche un bloc `CheckboxGroup` « Backup (optionnel) »
    **uniquement** quand `declareMode === "self"` **et** que la fiche STAR sélectionnée correspond
    à un compte ayant le rôle `DEPARTMENT_HEAD` ou `MINISTER` pour `churchId` (info déjà connue
    côté page via `session.user.churchRoles`, passée en prop `selfBackupOptions` pré-calculée côté
    serveur — pas de nouvel appel réseau pour lister les options). Les options combinent STAR du
    périmètre + responsables éligibles (valeur préfixée `star:<memberId>` / `role:<userChurchRoleId>`,
    séparée au submit).
  - Même formulaire réutilisé pour l'édition : un bouton « Modifier » (à côté d'« Annuler », visible
    si `status === "ACTIVE"` et date de fin non passée) ouvre le même `Modal` pré-rempli, avec un
    appel `PATCH .../[id]` (`action: "update"`) au lieu de `POST`.
  - Date de fin (#5) : `onChange` de la date de début met à jour `formEndDate` si vide ou
    antérieure à la nouvelle date de début ; l'`Input` date de fin reçoit `min={formStartDate}`.
  - Colonne « Backup(s) » ajoutée aux deux `DataTable` (mes absences + vue d'ensemble), affichant
    les noms séparés par virgule (ou « — »).
  - Bascule « Tableau / Frise » (deux boutons ou `Select`) au-dessus de la vue d'ensemble ; l'état
    (`viewMode`) ne change que le rendu, les filtres et `displayedAbsences` restent partagés.
  - Bouton « Exporter » dans l'en-tête de la vue d'ensemble : `POST /api/absences/export` avec
    `{ churchId, absenceIds: displayedAbsences.map(a => a.id) }`, réponse transformée en
    `Blob` et téléchargée (même pattern que les exports déjà en place côté client, ex.
    `RequestsDashboard`/`MediaDashboard` pour les téléchargements de fichiers).

- **`AbsencesTimeline.tsx`** *(nouveau, colocalisé dans* `src/app/(auth)/absences/`*)* : reçoit
  `displayedAbsences` (même tableau que `DataTable`) + la plage `[dateFrom, dateTo]` effective
  (calculée depuis les filtres actifs, ou min/max des données si aucun filtre de date). Regroupe
  les absences par membre, une ligne par membre, chaque absence positionnée en `%` sur un axe
  horizontal (`left`/`width` calculés depuis les dates, division simple, pas de librairie). Un clic
  sur un segment ouvre le même détail que `DataTable` (réutilise `highlightedId`/scroll existant
  ou une simple info-bulle). Pas de nouvel appel réseau.

- **Page `page.tsx`** : ajoute au chargement serveur la détection du rôle du déclarant
  (`DEPARTMENT_HEAD`/`MINISTER`) et la résolution des options de backup éligibles par fiche STAR
  self (départements/ministère couverts), passées en props à `AbsencesClient`.

## Décisions & alternatives écartées

- **Choix** : `AbsenceBackup` pointe vers `UserChurchRole` (pas directement vers `User`) pour les
  backups Resp. département/Ministre — *Pourquoi* : évite une jointure supplémentaire pour
  connaître le rôle exact et le périmètre couvert à l'affichage et à la validation, cohérent avec
  le pattern déjà utilisé par `resolveResponsibleUserIds`.
- **Choix** : un seul type `RESPONSIBLE` plutôt que deux (`DEPARTMENT_HEAD`/`MINISTER`) —
  *Pourquoi* : l'information est déjà portée par `userChurchRole.role`, dupliquer l'enum serait
  redondant et risquerait de désynchroniser si un `UserChurchRole` change de rôle après coup.
- **Choix** : édition = mise à jour en place du même enregistrement `Absence` (pas de nouvelle
  ligne, pas de table d'historique) — *Pourquoi* : imposé par la spec (traçabilité de la
  déclaration d'origine) ; un historique des versions n'est pas demandé et serait de la
  sur-ingénierie pour ce besoin.
- **Choix** : remplacement complet des `AbsenceBackup` à chaque édition plutôt qu'un diff
  ajout/retrait — *Pourquoi* : la liste de backups est petite (max 10), le remplacement complet
  est plus simple à raisonner et à tester, sans overhead perceptible.
- **Choix** : export reçoit la liste d'IDs actuellement affichés plutôt que de dupliquer la logique
  de filtrage (recherche, statut, plage de dates) côté serveur — *Pourquoi* : ces filtres sont
  aujourd'hui purement client (`useMemo`, cf. spec [[012-harmonisation-ergonomie-absences]]) ;
  réimplémenter la même logique côté serveur créerait deux sources de vérité à maintenir en
  synchronisation. Le périmètre de visibilité (scope département/ministère/église) reste
  revérifié côté serveur en filtrant les IDs reçus à ceux réellement autorisés, donc un ID hors
  périmètre ne fuite jamais dans l'export.
- **Choix** : frise développée en composant maison (positionnement CSS en `%`) plutôt qu'avec
  `recharts` (déjà une dépendance) — *Pourquoi* : `recharts` est orienté graphiques
  statistiques (barres, lignes, camemberts) et n'a pas de primitive Gantt/frise adaptée ; un
  composant dédié léger évite de détourner une librairie pour un rendu qu'elle ne couvre pas
  nativement.
- **Écarté** : autoriser un STAR simple à proposer un backup pour sa propre absence — *Raison* :
  explicitement exclu par la spec (backup réservé aux absences des responsables).
- **Écarté** : notification automatique au backup lui proposant de « prendre le service » —
  *Raison* : hors périmètre explicite de la spec ; la désignation reste informative.
- **Écarté** : endpoint GET dédié pour lister les backups éligibles à la volée — *Raison* : la
  liste dépend uniquement du rôle/périmètre déjà connu au chargement de la page (Server
  Component) ; un aller-retour réseau supplémentaire n'apporterait rien.

## Risques & points d'attention

- **Cohérence `type` / colonnes renseignées sur `AbsenceBackup`** : le service doit garantir que
  `memberId` XOR `userChurchRoleId` est renseigné selon `type` — à tester explicitement (create
  avec les deux, ou aucun, doit être impossible depuis le service même si la base ne l'empêche
  pas).
- **Édition concurrente / absence passée entre l'ouverture du formulaire et la soumission** : si
  l'absence passe en "non modifiable" (date de fin dépassée) pendant que l'utilisateur avait le
  formulaire ouvert, le service doit re-vérifier au moment de l'écriture (pas seulement à
  l'ouverture côté client) et renvoyer `409`.
- **Export et périmètre** : bien tester qu'un `absenceIds` contenant un ID hors périmètre de
  l'appelant (deviné/forgé) est silencieusement exclu du fichier généré, sans erreur ni fuite
  d'information sur son existence.
- **Backup pointant vers un `UserChurchRole` supprimé/modifié** : si un Resp. département perd son
  rôle après avoir été désigné backup, l'affichage doit gérer une relation potentiellement
  incohérente sans crasher (le `onDelete: Cascade` supprime la ligne `AbsenceBackup`
  correspondante — comportement acceptable et cohérent avec le reste du schéma).
- **Frise avec beaucoup de membres/absences** : pas de pagination prévue (volumétrie attendue
  faible, comme pour la vue tableau) — à revisiter si un usage réel montre un problème de
  lisibilité avec beaucoup de lignes.

## Stratégie de tests

Tests unitaires (Vitest) dans `src/modules/planning/services/absence.service.test.ts` (extension) :

- `declareAbsence` avec des backups `STAR` et `RESPONSIBLE` crée les `AbsenceBackup` attendus et
  notifie chaque destinataire résolu (avec/sans `MemberUserLink` pour le cas `STAR`).
- `declareAbsence` sans backups conserve exactement le comportement actuel (non-régression).
- `updateAbsence` modifie la période, recalcule les conflits, notifie les nouveaux conflits et
  l'ensemble des destinataires (anciens + nouveaux backups).
- `updateAbsence` refuse (409) une absence dont la date de fin est déjà passée.
- `updateAbsence` refuse (400) une nouvelle `startDate` antérieure à la date de début déjà
  enregistrée quand l'absence est déjà en cours.
- `updateAbsence` remplace intégralement les backups quand une nouvelle liste est fournie, et les
  laisse inchangés quand `backups` est omis.
- `cancelAbsence` notifie aussi les backups de l'absence annulée.

Tests d'intégration légers sur les routes (`src/app/api/absences/__tests__/`, extension) :

- `POST /api/absences` avec `backups` : `403` si `!isSelf`, `403` si le déclarant n'a pas le rôle
  requis, `403` si un backup est hors périmètre (autre ministère pour un `DEPARTMENT_HEAD`, cible
  = soi-même pour un `RESPONSIBLE` désigné par un `MINISTER`), `201` sinon.
- `PATCH /api/absences/[id]` avec `action: "update"` : mêmes codes de statut que `cancel` pour
  l'autorisation ; `409` si déjà passée.
- `POST /api/absences/export` : `403` sans `absences:view` ; fichier `.xlsx` généré (vérifier
  `Content-Type`) contenant uniquement les IDs dans le périmètre de l'appelant même si la requête
  en fournit hors périmètre.
