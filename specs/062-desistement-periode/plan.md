# Plan technique — Désistement depuis une période d'indisponibilité

- **Spec associée** : `./spec.md`
- **Statut** : Implémenté
- **Mis à jour le** : 2026-10-10
- **S'appuie sur** : spec 061 (`ServiceWithdrawal`, services `withdrawals/`), spec 050/058
  (absences par période, `absence.service.ts`), spec 013 (backups d'absence)

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : la nouvelle route n'importe que `@/modules/planning` ; la logique
  vit dans `src/modules/planning/services/`
- [x] **Sécurité** : la route d'aperçu réutilise `requireAbsenceSubjectAccess` (soi-même, ou
  `absences:manage` + périmètre départemental), comme `target-options` ; les routes existantes
  gardent leurs gardes
- [x] **Permissions** via `rolePermissions` : aucune permission nouvelle
- [x] **Validation** Zod : paramètres de l'aperçu validés ; les schémas `POST`/`PATCH`
  `/api/absences` sont inchangés
- [x] **Migration** Prisma : une colonne `absenceId` sur `service_withdrawals`
- [x] **Enums** importés depuis `@/generated/prisma/client`
- [x] **UI** : `ConfirmModal`/`Alert`/`useToast` réutilisés dans le formulaire partagé
  `UnavailabilityPeriodForm`

## Approche générale

On branche les désistements de la spec 061 **dans les trois services d'absence**
(`declareAbsence`, `updateAbsence`, `cancelAbsence`), à l'intérieur de leurs transactions
existantes, en réutilisant `createWithdrawal` et le cœur de `cancelWithdrawal`. Chaque
désistement né d'une absence porte l'identifiant de cette absence : c'est ce qui permet, à
l'annulation ou à la modification, de ne toucher **que** les désistements qu'elle a créés.

Ordre dans la transaction : créer les désistements **avant** de calculer les conflits. Comme un
désistement remet le statut de planning à `null`, `findAbsenceConflicts` (qui ne lit que
`EN_SERVICE`/`EN_SERVICE_DEBRIEF`) ne renvoie plus que les services restés en place, c'est-à-dire
ceux dont l'échéance est passée. L'alerte `ABSENCE_CONFLICT` est ainsi remplacée sans branche
supplémentaire. Les notifications de désistement partent **après** la validation de la
transaction, comme dans la spec 061.

Côté écran, l'avertissement vit dans le **formulaire partagé** `UnavailabilityPeriodForm`
(Disponibilités et Indisponibilités). Il interroge une route d'aperçu avant d'enregistrer.

## Modèle de données

```prisma
model ServiceWithdrawal {
  // …
  /// Absence (période) à l'origine du désistement (spec 062) ; null pour « Je ne peux plus » ou
  /// une réponse « Pas disponible ».
  absenceId String?
  absence   Absence? @relation(fields: [absenceId], references: [id], onDelete: SetNull)

  @@index([absenceId, status])
}

model Absence {
  // …
  withdrawals ServiceWithdrawal[]
}
```

Migration `…_service_withdrawal_absence` : colonne nullable, clé étrangère `SET NULL`, index. Pas
de reprise de données : les périodes existantes ne sont pas rejouées (hors périmètre).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/absences/withdrawal-preview` | GET | `requireAbsenceSubjectAccess` (soi-même, ou `absences:manage` + périmètre) | query `churchId`, `memberId`, `startDate`, `endDate`, `allDepartments`, `departmentIds` (csv), `absenceId?` (Zod) | `{ services: [{ eventId, title, date, departmentId, departmentName }] }` |
| `/api/absences` | POST | inchangée | inchangée | absence + `withdrawalCount` |
| `/api/absences/[id]` | PATCH (`update` / `cancel`) | inchangée | inchangée | absence + `withdrawalCount` / `cancelledWithdrawalCount` |

- L'aperçu renvoie les services qui **seraient désistés** : planifiés (statut de
  `PLANNED_STATUSES`), couverts par le ciblage, `withdrawable`, sans désistement déjà en attente.
  Avec `absenceId` (modification), il exclut les services déjà désistés par cette absence.
- Il est purement indicatif : l'enregistrement recalcule tout, l'écart possible entre aperçu et
  enregistrement est accepté.
- La route est couverte par le préfixe `/api/absences`, déjà déclaré dans le manifeste planning
  (`route-exhaustiveness`). Elle n'importe pas Prisma (`lint:prisma-boundary`).

## Services / logique métier

Nouveau fichier `src/modules/planning/services/withdrawals/absence.ts` :

- **`findWithdrawableServicesForAbsence(tx, { memberId, churchId, targeting, excludeAbsenceId? }, now)`**
  - plannings du membre dont le statut est dans `PLANNED_STATUSES` (remplaçant compris), dans
    l'église, pour un événement à venir couvert par le ciblage ;
  - même fenêtre et même filtre départemental que `findAbsenceConflicts` (pas de second
    calendrier) ;
  - filtrés par `withdrawable(event, now)` ;
  - un service ayant déjà un désistement `PENDING` est exclu.
  - Sert à l'aperçu et à la création.
- **`withdrawForAbsence(tx, { absenceId, churchId, memberId, actorId, targeting }, now)`**
  - appelle `createWithdrawal(…, { absenceId, recordResponse: false })` pour chaque service
    trouvé et renvoie les identifiants.
- **`cancelAbsenceWithdrawals(tx, { absenceId, actorId, keep?: (w) => boolean }, now)`**
  - parcourt les désistements de l'absence ;
  - les `PENDING` non retenus par `keep` (ceux encore couverts, en cas de modification) passent à
    `CANCELLED` : statut d'origine restauré, **sans** réponse « Disponible » ;
  - les `REPLACED`/`CLOSED` sont rapportés pour l'information du STAR ;
  - renvoie `{ cancelled: string[], kept: WithdrawalNotice[] }`.
- **`sendAbsenceWithdrawalNotices({ created, cancelled, kept, starUserIds, thirdParty })`**,
  appelé hors transaction :
  - `sendWithdrawalNotice` pour chaque désistement créé ;
  - `notifyWithdrawalCancelled` pour chaque annulé ;
  - au STAR, une notification regroupée `SERVICE_WITHDRAWAL_BY_ABSENCE` quand un tiers a déclaré
    (« Tu as été retiré de N services… ») ;
  - au STAR, une notification `SERVICE_WITHDRAWAL_KEPT` pour les services déjà pourvus ou clos à
    l'annulation ou à la modification.
  - Erreurs journalisées, jamais propagées (comme la spec 061).

Modifications de l'existant :

- **`createWithdrawal`** (spec 061) : options `{ absenceId?, recordResponse = true }`.
  - Avec `recordResponse: false`, pas d'upsert de réponse « Pas disponible » : la période suffit,
    et la spec 058 supprime justement les réponses qu'elle couvre.
  - Le contrôle d'échéance et le contrôle « déjà en attente » restent ; le second ne peut pas se
    déclencher puisque `find…` exclut ces services.
- **`cancelWithdrawal`** : extraction du cœur transactionnel `cancelPendingWithdrawal(tx, id,
  actorId, { restoreResponse })`, réutilisé par `cancelAbsenceWithdrawals`. « Annuler mon
  désistement » garde `restoreResponse: true` : la réponse « Disponible » l'emporte sur la période
  (`resolveAvailability`), ce qui donne le comportement de la spec (le service repris n'est pas
  re-désisté).
- **`declareAbsence`** :
  - après `deleteResponsesCoveredByPeriod` et les backups, `withdrawForAbsence`, **puis**
    `findAbsenceConflicts` (conflits restants seulement) ;
  - la transaction renvoie `{ absence, withdrawalIds }` ;
  - hors transaction : `logAudit` CREATE `ServiceWithdrawal` (`source: "absence"`) et
    `sendAbsenceWithdrawalNotices`. Le tiers est détecté par `!isMemberLinkedToUser(memberId,
    createdById)`.
- **`updateAbsence`** :
  - après la réécriture du ciblage et `deleteResponsesCoveredByPeriod`,
    `cancelAbsenceWithdrawals(keep = encore couvert par le nouveau ciblage)` ;
  - puis `withdrawForAbsence` sur le nouveau ciblage, puis `conflictsAfter`.
  - Un service repris par le STAR (réponse « Disponible ») a perdu sa réponse avec
    `deleteResponsesCoveredByPeriod` : il est re-désisté. C'est le cas « sauf si la période est
    modifiée ensuite pour le couvrir encore » de la spec.
- **`cancelAbsence`** : `cancelAbsenceWithdrawals` (aucun conservé), notifications après.
- **Types de retour** : les trois services renvoient l'absence plus les compteurs. Les routes
  `/api/absences` les relaient.
- **Bus** : `hasConflict` des événements `planning:absence:*` désigne désormais les conflits
  **restants** ; aucun abonné ne dépend de l'ancien sens (tests seulement).
- **Index du module** : export de `findWithdrawableServicesForAbsence` (aperçu).

## UI / composants

- **`UnavailabilityPeriodForm`** (partagé Disponibilités / Indisponibilités) :
  - au clic sur « Enregistrer », appel de l'aperçu ; s'il renvoie des services, `ConfirmModal`
    « Tu es planifié le 12 (Choristes), le 19 (Musiciens) : tes responsables vont devoir te
    remplacer. » ;
  - en mode tiers, texte à la 3ᵉ personne (« Paul est planifié… ses services deviendront « à
    remplacer » ») ;
  - liste à puces si plus de trois services ; boutons pleine largeur sur mobile, comme les
    modales existantes ;
  - sans service, enregistrement direct.
- **Toasts** : `AvailabilityClient` et `AbsencesClient` affichent « N désistement(s) créés : tes
  responsables sont prévenus » (ou « N désistement(s) annulés ») à partir des compteurs.
- **Mon planning**, grille, écran de remplacement : inchangés, les désistements créés étant des
  `ServiceWithdrawal` ordinaires.

## Décisions & alternatives écartées

- **Choix** : colonne `absenceId` sur le désistement — *Pourquoi* : seule façon fiable de
  distinguer, à l'annulation, les désistements nés de la période de ceux faits indépendamment
  (exigence de la spec). Un recalcul par recouvrement de dates confondrait les deux.
- **Choix** : désistements créés dans la transaction de l'absence — *Pourquoi* : une période ne
  doit jamais exister sans ses désistements, ni l'inverse. Les notifications restent hors
  transaction (règle de la spec 053/061).
- **Choix** : créer les désistements avant de calculer les conflits — *Pourquoi* : l'alerte de
  conflit est remplacée sans branche dédiée, et le reliquat est exactement « échéance passée ».
- **Choix** : pas de réponse « Pas disponible » écrite par un désistement né d'une période, ni de
  « Disponible » à son annulation — *Pourquoi* : la période fait foi (spec 058 supprime les
  réponses qu'elle couvre) ; une réponse fabriquée survivrait à l'annulation de l'absence et
  fausserait la disponibilité.
- **Choix** : route d'aperçu GET — *Pourquoi* : l'avertissement doit lister les services avant
  l'enregistrement, pour n'importe quelle période (y compris hors du mois affiché), et le
  formulaire est partagé par deux écrans.
- **Écarté** : aller-retour « 409 confirmation requise » puis renvoi avec `confirm: true` —
  *Raison* : contrat d'API plus complexe pour un avertissement qui n'est pas une règle de
  sécurité.
- **Écarté** : abonnement aux événements de bus `planning:absence:*` — *Raison* : les émissions
  sont dans la transaction, mais un abonné ne peut pas faire échouer l'absence de façon lisible.
  Les compteurs de retour et l'ordre « désistements puis conflits » imposent un appel direct.
- **Écarté** : rejouer les absences existantes à la mise en service — hors périmètre de la spec.

Aucune décision structurante au sens des ADR : extension locale du module planning.

### Écarts constatés à l'implémentation (2026-10-10)

- **`excludeAbsenceId` et paramètre `absenceId` de l'aperçu retirés** : inutiles. Un service déjà
  désisté par la période est soit en attente (exclu comme tout désistement `PENDING`), soit n'est
  plus planifié ; l'aperçu en modification donne donc le bon résultat sans identifier l'absence.
- **Avertissement en `Alert` dans le formulaire plutôt qu'en `ConfirmModal`** : le formulaire est
  lui-même affiché dans une modale ou un panneau ; empiler une seconde modale est pénible sur
  mobile. L'avertissement (liste des services, « Modifier » / « Confirmer et enregistrer »)
  s'affiche à la place des boutons d'enregistrement.
- **Routes `POST`/`PATCH` sans changement de code** (T16) : les services renvoient l'absence
  augmentée des compteurs, relayée telle quelle.

## Risques & points d'attention

- **Fenêtre de dates** : on reprend celle de `findAbsenceConflicts`/`absenceCovers`
  (`startDate ≤ date ≤ endDate`). Si une incohérence de fin de journée existe, elle touche déjà les
  conflits et la disponibilité, et sera traitée à part. Un test vérifie qu'un service du dernier
  jour de la période est couvert dans les conditions réelles du formulaire.
- **Transaction plus longue** pour une longue période (un `createWithdrawal` par service) :
  quelques services par mois en pratique, ce qui reste acceptable.
- **Volume de notifications** : une notification par service pour le responsable (choix de la
  spec 061) ; le STAR reçoit des notifications regroupées.
- **`updateAbsence` sans changement de ciblage** (motif ou backups seuls) : ni annulation ni
  création de désistement. Un test le vérifie.
- **Le STAR reprend un service puis la période est modifiée** : re-désistement voulu par la spec,
  à tester.

## Stratégie de tests

- `withdrawals/__tests__/absence.test.ts` :
  - `findWithdrawableServicesForAbsence` : statuts planifiés (remplaçant compris), échéance,
    filtre départemental, désistement en attente exclu, `excludeAbsenceId` ;
  - `withdrawForAbsence` : `absenceId` posé, aucune réponse écrite ;
  - `cancelAbsenceWithdrawals` : `PENDING` annulés avec restauration, `keep` respecté,
    `REPLACED`/`CLOSED` rapportés, désistements d'autres origines intacts.
- `withdraw.test.ts` / `resolve.test.ts` : options `recordResponse` et `restoreResponse`.
- `absence.service.test.ts` :
  - déclaration : désistements créés, `ABSENCE_CONFLICT` seulement pour les services après
    échéance, `ABSENCE_DECLARED` toujours, notification au STAR si tiers ;
  - modification : raccourcissement (annulations), prolongation (créations), motif seul (rien) ;
  - annulation : annulés, et conservés notifiés au STAR.
- Routes : `withdrawal-preview` (403 hors périmètre, 400 Zod, `absenceId`) ; `POST`/`PATCH`
  relaient les compteurs.
- `UnavailabilityPeriodForm` : pas de test de composant (pas d'infrastructure en place, cf.
  #672). Vérification manuelle en recette, mobile compris.
